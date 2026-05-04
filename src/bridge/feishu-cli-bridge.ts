import { exec } from 'child_process';
import type { UploadResult, PreflightResult, RemoteFile } from '../types';

export class CliNotFoundError extends Error {
  name = 'CliNotFoundError';
  constructor(message: string) {
    super(message);
  }
}

export class AuthRequiredError extends Error {
  name = 'AuthRequiredError';
  constructor(message: string) {
    super(message);
  }
}

export class TimeoutError extends Error {
  name = 'TimeoutError';
  constructor(
    public timeoutMs: number,
    public command: string,
  ) {
    super(`Command "${command}" timed out after ${timeoutMs}ms`);
  }
}

export class FolderNotFoundError extends Error {
  name = 'FolderNotFoundError';
  constructor(public folderPath: string) {
    super(`Folder not found: "${folderPath}"`);
  }
}

export class FolderAmbiguousError extends Error {
  name = 'FolderAmbiguousError';
  constructor(
    public folderPath: string,
    public matches: string[],
  ) {
    super(`Ambiguous folder path "${folderPath}". Matches: ${matches.join(', ')}`);
  }
}

export class ApiError extends Error {
  name = 'ApiError';
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
    public data?: any,
  ) {
    super(message);
  }
}

export class RateLimitError extends Error {
  name = 'RateLimitError';
  constructor(
    public retryAfterMs: number,
    message: string,
  ) {
    super(message);
  }
}

export interface CliBridgeConfig {
  timeoutMs: number;
  cliPath?: string;
}

const DEFAULT_CONFIG: CliBridgeConfig = {
  timeoutMs: 30_000,
  cliPath: 'lark-cli',
};

export const REQUIRED_SCOPES = [
  'drive:file:upload',
  'drive:drive.metadata:readonly',
  'drive:file:download',
  'docx:document:readonly',
  'sheets:spreadsheet:read',
  'bitable:app:read',
] as const;

export class FeishuCliBridge {
  constructor(private config: CliBridgeConfig = DEFAULT_CONFIG) {
    if (!this.config.cliPath) this.config.cliPath = DEFAULT_CONFIG.cliPath;
  }

  executeCommand(command: string, cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const opts: any = { encoding: 'utf-8', timeout: this.config.timeoutMs };
      if (cwd) opts.cwd = cwd;
      const child = exec(command, opts, (err, stdout, stderr) => {
        if (err) {
          const nodeErr = err as NodeJS.ErrnoException;
          if (nodeErr.code === 'ENOENT' || (err.message && err.message.includes('not found'))) {
            reject(new CliNotFoundError(`Command not found: ${command.split(' ')[0]}`));
            return;
          }
          if ((err as any).killed || (err.message && err.message.includes('timeout'))) {
            reject(new TimeoutError(this.config.timeoutMs, command));
            return;
          }
          if (stderr) {
            try {
              const parsed = JSON.parse(stderr);
              const code = parsed.error?.code ?? parsed.code;
              const message = parsed.error?.message ?? parsed.msg ?? stderr;
              reject(new ApiError(code ?? 1, message, code?.toString() ?? 'UNKNOWN', parsed.data));
            } catch {
              reject(new ApiError(1, stderr || err.message, 'UNKNOWN'));
            }
            return;
          }
          reject(new ApiError(1, err.message, 'UNKNOWN'));
          return;
        }
        resolve(stdout);
      });
    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const delays = [3000, 10000, 30000];
    let lastError: Error = new Error('unknown');

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (err instanceof CliNotFoundError || err instanceof AuthRequiredError || err instanceof FolderNotFoundError || err instanceof FolderAmbiguousError) throw err;
        if (attempt < delays.length) {
          await new Promise(r => setTimeout(r, delays[attempt]));
        }
      }
    }
    throw lastError;
  }

  async preflight(): Promise<PreflightResult> {
    return this.withRetry(async () => {
      try {
        const versionOutput = await this.executeCommand(`${this.config.cliPath} --version`);
        const versionMatch = versionOutput.match(/[\d]+\.[\d]+\.[\d]+/);
        const cliVersion = versionMatch ? versionMatch[0] : undefined;

        const authOutput = await this.executeCommand(`${this.config.cliPath} auth status`);
        let authData: any;
        try {
          authData = JSON.parse(authOutput);
        } catch {
          return { success: false, error: 'Failed to parse auth status', errorCode: 'AUTH_CHECK_FAILED' };
        }
        const authReady = authData?.tokenStatus === 'valid';

        if (!authReady) {
          return { success: false, error: 'Auth not ready', errorCode: 'AUTH_REQUIRED' };
        }

        const grantedScopes = (authData?.scope || '').split(' ').filter(Boolean);
        const missingScopes = REQUIRED_SCOPES.filter(s => !grantedScopes.includes(s));
        if (missingScopes.length > 0) {
          return { success: false, error: `Missing required scopes: ${missingScopes.join(', ')}`, errorCode: 'INSUFFICIENT_SCOPE' };
        }

        return { success: true, cliVersion, authReady: true };
      } catch (err) {
        if (err instanceof CliNotFoundError) {
          return { success: false, error: 'lark-cli not found in PATH', errorCode: 'CLI_NOT_FOUND' };
        }
        throw err;
      }
    });
  }

  async uploadFile(localPath: string, folderToken: string, fileName: string, cwd?: string): Promise<UploadResult> {
    const cmd = `${this.config.cliPath} drive +upload --file "${localPath}" --folder-token "${folderToken}" --name "${fileName}"`;
    return this.withRetry(async () => {
      const stdout = await this.executeCommand(cmd, cwd);
      const data = JSON.parse(stdout).data;
      return { fileToken: data.file_token, url: data.url };
    });
  }

  async createFolder(parentToken: string, folderName: string): Promise<string> {
    const cmd = `${this.config.cliPath} drive +create-folder --folder-token "${parentToken}" --name "${folderName}"`;
    return this.withRetry(async () => {
      const stdout = await this.executeCommand(cmd);
      return JSON.parse(stdout).data.folder_token;
    });
  }

  async findSubfolder(parentToken: string, folderName: string): Promise<string | null> {
    const params = JSON.stringify({ folder_token: parentToken });
    const escapedParams = params.replace(/"/g, '\\"');
    const cmd = `${this.config.cliPath} drive files list --params "${escapedParams}" --page-all`;
    return this.withRetry(async () => {
      const stdout = await this.executeCommand(cmd);
      const files = JSON.parse(stdout).data?.files;
      if (!files || !Array.isArray(files)) return null;
      const found = files.find((f: any) => f.name === folderName && f.type === 'folder');
      return found ? found.token : null;
    });
  }

  async deleteFile(fileToken: string): Promise<void> {
    const cmd = `${this.config.cliPath} drive +delete --file-token "${fileToken}" --type file --yes`;
    await this.withRetry(() => this.executeCommand(cmd));
  }

  async moveFile(fileToken: string, targetFolderToken: string): Promise<void> {
    const cmd = `${this.config.cliPath} drive +move --file-token "${fileToken}" --folder-token "${targetFolderToken}" --type file`;
    await this.withRetry(() => this.executeCommand(cmd));
  }

  async resolveFolderToken(folderPath: string): Promise<string> {
    // Strip leading / for search API compatibility — query is text-based,
    // and /obsvault won't match a folder named "obsvault"
    const query = folderPath.replace(/^\/+/, '');
    const cmd = `${this.config.cliPath} drive +search --query ${this.escapeArg(query)} --doc-types folder`;
    return this.withRetry(async () => {
      try {
        const stdout = await this.executeCommand(cmd);
        let parsed: any;
        try {
          parsed = JSON.parse(stdout);
        } catch {
          throw new FolderNotFoundError(folderPath);
        }
        const results = parsed?.data?.results;
        if (!results || !Array.isArray(results) || results.length === 0) {
          throw new FolderNotFoundError(folderPath);
        }
        // Filter to only FOLDER type results
        const folders = results.filter(
          (r: any) => r?.result_meta?.doc_types === 'FOLDER',
        );
        if (folders.length === 0) {
          throw new FolderNotFoundError(folderPath);
        }
        if (folders.length > 1) {
          const names = folders.map(
            (f: any) => f.result_meta?.url || f.title_highlighted || '(unknown)',
          );
          throw new FolderAmbiguousError(folderPath, names);
        }
        return folders[0].result_meta.token;
      } catch (err) {
        if (err instanceof FolderNotFoundError || err instanceof FolderAmbiguousError) throw err;
        throw err;
      }
    });
  }

  async listRemoteFiles(folderToken: string): Promise<RemoteFile[]> {
    const params = JSON.stringify({ folder_token: folderToken });
    const escapedParams = params.replace(/"/g, '\\"');
    const cmd = `${this.config.cliPath} drive files list --params "${escapedParams}" --page-all`;
    return this.withRetry(async () => {
      const stdout = await this.executeCommand(cmd);
      const parsed = JSON.parse(stdout);
      const files = parsed?.data?.files;
      if (!files || !Array.isArray(files)) return [];
      return files.map((f: any) => ({
        token: f.token,
        name: f.name,
        type: f.type as RemoteFile['type'],
        modifiedAt: f.modified_at,
      }));
    });
  }

  async getFileMetadata(fileToken: string): Promise<RemoteFile> {
    const cmd = `${this.config.cliPath} drive files list --file-token "${fileToken}"`;
    const stdout = await this.executeCommand(cmd);
    const parsed = JSON.parse(stdout);
    const f = parsed?.data?.file ?? parsed?.data?.files?.[0];
    if (!f) {
      throw new ApiError(1, `File metadata not found for token: ${fileToken}`, 'FILE_NOT_FOUND');
    }
    return {
      token: f.token,
      name: f.name,
      type: f.type as RemoteFile['type'],
      modifiedAt: f.modified_at,
    };
  }

  async downloadFile(fileToken: string, outputPath: string): Promise<void> {
    const cmd = `${this.config.cliPath} drive +download --file-token "${fileToken}" --output "${outputPath}"`;
    await this.withRetry(() => this.executeCommand(cmd));
  }

  async exportDoc(docToken: string, docType: string): Promise<string> {
    const cmd = `${this.config.cliPath} drive +export --file-token "${docToken}" --doc-type "${docType}" --output-format "md"`;
    return this.withRetry(async () => {
      return await this.executeCommand(cmd);
    });
  }

  private escapeArg(arg: string): string {
    if (/^[a-zA-Z0-9_\-/.]+$/.test(arg)) return arg;
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
}
