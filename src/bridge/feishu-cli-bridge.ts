import { exec } from 'child_process';
import type { UploadResult, PreflightResult } from '../types';

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

export class ApiError extends Error {
  name = 'ApiError';
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
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
              reject(new ApiError(parsed.code ?? 1, parsed.msg ?? stderr, parsed.code?.toString() ?? 'UNKNOWN'));
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
        if (err instanceof CliNotFoundError || err instanceof AuthRequiredError) throw err;
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

  async deleteFile(fileToken: string): Promise<void> {
    const cmd = `${this.config.cliPath} drive +delete --file-token "${fileToken}" --type file --yes`;
    await this.withRetry(() => this.executeCommand(cmd));
  }

  async moveFile(fileToken: string, targetFolderToken: string): Promise<void> {
    const cmd = `${this.config.cliPath} drive +move --file-token "${fileToken}" --folder-token "${targetFolderToken}" --type file`;
    await this.withRetry(() => this.executeCommand(cmd));
  }
}
