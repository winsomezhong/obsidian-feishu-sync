import { exec } from 'child_process';

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
  cliPath: string;
}

const DEFAULT_CONFIG: CliBridgeConfig = {
  timeoutMs: 30_000,
  cliPath: 'lark-cli',
};

export type PreflightResult =
  | { success: true; cliVersion?: string; authReady: boolean }
  | { success: false; error: string; errorCode: string };

export class FeishuCliBridge {
  constructor(private config: CliBridgeConfig = DEFAULT_CONFIG) {}

  executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const fullCmd = command;

      exec(fullCmd, { encoding: 'utf-8', timeout: this.config.timeoutMs }, (err, stdout, stderr) => {
        if (err) {
          const nodeErr = err as NodeJS.ErrnoException;
          if (nodeErr.code === 'ENOENT' || (err.message && err.message.includes('not found'))) {
            reject(new CliNotFoundError(`Command not found: ${command.split(' ')[0]}`));
            return;
          }
          if (nodeErr.killed || (err.message && err.message.includes('timeout'))) {
            reject(new TimeoutError(this.config.timeoutMs, fullCmd));
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

  async preflight(): Promise<PreflightResult> {
    try {
      const versionOutput = await this.executeCommand(`${this.config.cliPath} --version`);
      const versionMatch = versionOutput.match(/[\d]+\.[\d]+\.[\d]+/);
      const cliVersion = versionMatch ? versionMatch[0] : undefined;

      const authOutput = await this.executeCommand(`${this.config.cliPath} auth status`);
      const authData = JSON.parse(authOutput);
      const authReady = authData?.data?.status === 'ready';

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
  }
}
