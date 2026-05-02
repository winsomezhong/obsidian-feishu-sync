import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec } from 'child_process';
import {
  CliNotFoundError,
  AuthRequiredError,
  TimeoutError,
  ApiError,
  RateLimitError,
  FeishuCliBridge,
} from './feishu-cli-bridge';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

function mockChild() {
  return { stdin: { write: vi.fn(), end: vi.fn() } };
}

describe('FeishuCliBridge errors', () => {
  it('CliNotFoundError has correct name and message', () => {
    const err = new CliNotFoundError('lark-cli not found');
    expect(err.name).toBe('CliNotFoundError');
    expect(err.message).toContain('lark-cli');
  });

  it('AuthRequiredError has correct name', () => {
    const err = new AuthRequiredError('auth expired');
    expect(err.name).toBe('AuthRequiredError');
  });

  it('TimeoutError has correct name and timeout property', () => {
    const err = new TimeoutError(30000, 'drive +upload');
    expect(err.name).toBe('TimeoutError');
    expect(err.timeoutMs).toBe(30000);
  });

  it('ApiError has code and status', () => {
    const err = new ApiError(400, 'bad request', 'INVALID_PARAMS');
    expect(err.name).toBe('ApiError');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVALID_PARAMS');
  });

  it('RateLimitError has retryAfter', () => {
    const err = new RateLimitError(3000, 'rate limited');
    expect(err.name).toBe('RateLimitError');
    expect(err.retryAfterMs).toBe(3000);
  });

  it('all error classes extend Error', () => {
    expect(new CliNotFoundError('')).toBeInstanceOf(Error);
    expect(new AuthRequiredError('')).toBeInstanceOf(Error);
    expect(new TimeoutError(0, '')).toBeInstanceOf(Error);
    expect(new ApiError(0, '', '')).toBeInstanceOf(Error);
    expect(new RateLimitError(0, '')).toBeInstanceOf(Error);
  });
});

describe('FeishuCliBridge', () => {
  let mockExec: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExec = exec as unknown as ReturnType<typeof vi.fn>;
  });

  describe('executeCommand', () => {
    it('executes command and returns stdout on success', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, '{"data": "ok"}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.executeCommand('some-cmd');
      expect(result).toBe('{"data": "ok"}');
    });

    it('throws CliNotFoundError when ENOENT', async () => {
      const err = new Error('not found');
      (err as any).code = 'ENOENT';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(err, '', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await expect(bridge.executeCommand('bad-cmd')).rejects.toThrow(CliNotFoundError);
    });

    it('throws TimeoutError when command times out', async () => {
      const err = new Error('timed out');
      (err as any).killed = true;
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(err, '', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge({ timeoutMs: 1 });
      await expect(bridge.executeCommand('sleep-cmd')).rejects.toThrow(TimeoutError);
    });

    it('throws ApiError with parsed code and message from stderr JSON', async () => {
      const err = new Error('command failed');
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(err, '', JSON.stringify({ code: 999, msg: 'invalid params' }));
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await expect(bridge.executeCommand('fail-cmd')).rejects.toThrow(ApiError);
    });
  });

  describe('preflight', () => {
    it('returns success when CLI is installed and authenticated', async () => {
      mockExec
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, 'lark-cli/1.2.3\n', '');
          return mockChild();
        })
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, JSON.stringify({ tokenStatus: 'valid' }), '');
          return mockChild();
        });
      const bridge = new FeishuCliBridge();
      const result = await bridge.preflight();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.cliVersion).toBe('1.2.3');
        expect(result.authReady).toBe(true);
      }
    });

    it('returns failure when CLI not installed', async () => {
      const err = new Error('not found');
      (err as any).code = 'ENOENT';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(err, '', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.preflight();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('CLI_NOT_FOUND');
      }
    });

    it('returns failure when auth not ready', async () => {
      mockExec
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, 'lark-cli/1.2.3\n', '');
          return mockChild();
        })
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, JSON.stringify({ tokenStatus: 'expired' }), '');
          return mockChild();
        });
      const bridge = new FeishuCliBridge();
      const result = await bridge.preflight();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('AUTH_REQUIRED');
      }
    });
  });

  describe('uploadFile', () => {
    it('returns fileToken and url on success', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({ data: { file_token: 'ftok123', url: 'https://drive.feishu.cn/file/ftok123' } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.uploadFile('/local/path/note.md', 'folderABC', 'note.md');
      expect(result.fileToken).toBe('ftok123');
      expect(result.url).toBe('https://drive.feishu.cn/file/ftok123');
    });

    it('constructs correct command with file path and folder token', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, JSON.stringify({ data: { file_token: 'ftok', url: '' } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.uploadFile('/vault/notes/hello.md', 'parentToken', 'hello.md');
      expect(usedCommand).toContain('drive +upload');
      expect(usedCommand).toContain('--file /vault/notes/hello.md');
      expect(usedCommand).toContain('--folder-token parentToken');
      expect(usedCommand).toContain('--name hello.md');
    });
  });

  describe('createFolder', () => {
    it('returns folder token on success', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({ data: { folder_token: 'fld456' } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.createFolder('parentToken', 'newFolder');
      expect(result).toBe('fld456');
    });

    it('constructs correct command', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, JSON.stringify({ data: { folder_token: 'fld' } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.createFolder('rootToken', 'subdir');
      expect(usedCommand).toContain('drive +create-folder');
      expect(usedCommand).toContain('--folder-token rootToken');
      expect(usedCommand).toContain('--name subdir');
    });
  });

  describe('deleteFile', () => {
    it('resolves without error on success', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, '{}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await expect(bridge.deleteFile('ftok789')).resolves.not.toThrow();
    });

    it('constructs correct command', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, '{}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.deleteFile('ftok789');
      expect(usedCommand).toContain('drive +delete');
      expect(usedCommand).toContain('--file-token ftok789');
      expect(usedCommand).toContain('--type file');
      expect(usedCommand).toContain('--yes');
    });
  });

  describe('moveFile', () => {
    it('resolves without error on success', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, '{}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await expect(bridge.moveFile('ftok123', 'newFolder456')).resolves.not.toThrow();
    });

    it('constructs correct command', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, '{}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.moveFile('ftok123', 'newFolder456');
      expect(usedCommand).toContain('drive +move');
      expect(usedCommand).toContain('--file-token ftok123');
      expect(usedCommand).toContain('--folder-token newFolder456');
      expect(usedCommand).toContain('--type file');
    });
  });

  describe('retry logic', () => {
    it('retries on error up to max attempts for uploadFile', async () => {
      vi.useFakeTimers();
      let attempts = 0;
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        attempts++;
        if (attempts < 3) {
          cb(new Error('rate limited'), '', 'rate limited');
        } else {
          cb(null, JSON.stringify({ data: { file_token: 'ftok789', url: '' } }), '');
        }
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const resultPromise = bridge.uploadFile('/f.md', 'fld', 'f.md');
      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(10000);
      const result = await resultPromise;
      expect(result.fileToken).toBe('ftok789');
      expect(attempts).toBe(3);
      vi.useRealTimers();
    });

    it('throws immediately on CliNotFoundError (no retry)', async () => {
      const err = new Error('not found');
      (err as any).code = 'ENOENT';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(err, '', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await expect(bridge.uploadFile('/f.md', 'fld', 'f.md')).rejects.toThrow(CliNotFoundError);
    });
  });
});
