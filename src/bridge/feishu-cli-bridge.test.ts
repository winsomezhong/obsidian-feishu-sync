import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec, spawn } from 'child_process';
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
  spawn: vi.fn(),
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
    const err = new TimeoutError(30000, 'docs +create');
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

    it('writes content to CWD temp file and uses relative path in command', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, 'done', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.executeCommand('cmd --content @-', 'hello');
      expect(usedCommand).toMatch(/cmd --content @lark-content-\d+-[a-z0-9]+\.md$/);
      expect(usedCommand).not.toContain('\\');
      expect(usedCommand).not.toContain('/');
      expect(result).toBe('done');
    });

    it('does not create temp file when input is undefined', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, 'output', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.executeCommand('cmd --content @-');
      expect(result).toBe('output');
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
        expect(result.error).toBeTruthy();
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

    it('handles version output without semver string', async () => {
      mockExec
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, 'lark-cli (unknown version)\n', '');
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
        expect(result.cliVersion).toBeUndefined();
      }
    });

    it('handles malformed auth status JSON', async () => {
      mockExec
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, 'lark-cli/1.2.3\n', '');
          return mockChild();
        })
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, 'not json\n', '');
          return mockChild();
        });
      const bridge = new FeishuCliBridge();
      const result = await bridge.preflight();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('AUTH_CHECK_FAILED');
      }
    });
  });

  describe('createDocument', () => {
    it('returns documentId and URL', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({ data: { document_id: 'doc456', url: 'https://feishu.cn/doc/doc456' } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.createDocument('My Title', '# Content', 'folder123');
      expect(result.documentId).toBe('doc456');
      expect(result.url).toBe('https://feishu.cn/doc/doc456');
    });
  });

  describe('updateDocument', () => {
    it('succeeds with correct command format', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, '{}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await expect(bridge.updateDocument('doc456', '# Updated')).resolves.not.toThrow();
      expect(usedCommand).toMatch(/lark-cli docs \+update --doc doc456 --mode overwrite --markdown @lark-content-\d+-[a-z0-9]+\.md/);
      expect(usedCommand).toContain('--doc doc456');
    });
  });

  describe('deleteDocument', () => {
    it('succeeds', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({ data: { status: 'success' } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await expect(bridge.deleteDocument('doc456')).resolves.not.toThrow();
    });
  });

  describe('fetchDocument', () => {
    it('returns markdown content', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, '# Hello from Feishu\n\nContent', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const content = await bridge.fetchDocument('doc456');
      expect(content).toContain('# Hello from Feishu');
    });
  });

  describe('temp file content passing', () => {
    it('replaces @- with temp file path for createDocument', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, JSON.stringify({ data: { document_id: 'doc1', url: '' } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.createDocument('Title', '# Hello', 'folder');
      expect(usedCommand).toMatch(/lark-cli docs \+create.*--markdown @lark-content-\d+-[a-z0-9]+\.md/);
      expect(usedCommand).toContain('--folder-token folder');
      expect(usedCommand).not.toContain('--title');
    });
  });

  describe('retry logic', () => {
    it('retries on error up to max attempts', async () => {
      vi.useFakeTimers();
      let attempts = 0;
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        attempts++;
        if (attempts < 3) {
          const err = new Error('rate limited');
          cb(err, '', 'rate limited');
        } else {
          cb(null, JSON.stringify({ data: { document_id: 'doc789', url: '' } }), '');
        }
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const resultPromise = bridge.createDocument('T', 'C', 'folder');
      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(10000);
      const result = await resultPromise;
      expect(result.documentId).toBe('doc789');
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
      await expect(bridge.createDocument('T', 'C', 'folder')).rejects.toThrow(CliNotFoundError);
    });

    it('succeeds on first attempt without retry', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({ data: { document_id: 'doc1', url: '' } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.createDocument('T', 'C', 'folder');
      expect(result.documentId).toBe('doc1');
    });
  });
});
