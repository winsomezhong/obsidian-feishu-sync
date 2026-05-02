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
}
