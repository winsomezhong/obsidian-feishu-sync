import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec } from 'child_process';
import {
  CliNotFoundError,
  AuthRequiredError,
  TimeoutError,
  ApiError,
  RateLimitError,
  FeishuCliBridge,
  REQUIRED_SCOPES,
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

describe('REQUIRED_SCOPES', () => {
  it('defines all 6 required scopes for Feishu API access', () => {
    expect(REQUIRED_SCOPES).toHaveLength(6);
    expect(REQUIRED_SCOPES).toContain('drive:file:upload');
    expect(REQUIRED_SCOPES).toContain('drive:drive.metadata:readonly');
    expect(REQUIRED_SCOPES).toContain('drive:file:download');
    expect(REQUIRED_SCOPES).toContain('docx:document:readonly');
    expect(REQUIRED_SCOPES).toContain('sheets:spreadsheet:read');
    expect(REQUIRED_SCOPES).toContain('bitable:app:read');
  });

  it('is a readonly tuple so scope list cannot be mutated', () => {
    expect(Array.isArray(REQUIRED_SCOPES)).toBe(true);
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

    it('passes cwd option to exec when provided', async () => {
      let receivedOpts: any;
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        receivedOpts = opts;
        cb(null, '{}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.executeCommand('some-cmd', '/my/vault');
      expect(receivedOpts.cwd).toBe('/my/vault');
    });

    it('does not set cwd in exec options when not provided', async () => {
      let receivedOpts: any;
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        receivedOpts = opts;
        cb(null, '{}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.executeCommand('some-cmd');
      expect(receivedOpts.cwd).toBeUndefined();
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

    it('extracts error code from nested Feishu API error format', async () => {
      const err = new Error('command failed');
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(err, '', JSON.stringify({
          ok: false,
          error: { code: 1061007, message: 'API call failed: [1061007] file has been delete.' },
        }));
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      let caught: any;
      try {
        await bridge.executeCommand('fail-cmd');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.code).toBe('1061007');
      expect(caught.message).toContain('file has been delete');
    });

    it('prefers nested error format over flat format when both present', async () => {
      const err = new Error('command failed');
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(err, '', JSON.stringify({
          code: 1,
          msg: 'flat msg',
          error: { code: 1061007, message: 'nested error message' },
        }));
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      let caught: any;
      try {
        await bridge.executeCommand('fail-cmd');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.code).toBe('1061007');
      expect(caught.message).toContain('nested error message');
    });
  });

  describe('preflight', () => {
    it('returns success when CLI is installed and has all required scopes', async () => {
      mockExec
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, 'lark-cli/1.2.3\n', '');
          return mockChild();
        })
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, JSON.stringify({
            tokenStatus: 'valid',
            scope: 'drive:file:upload drive:drive.metadata:readonly drive:file:download docx:document:readonly sheets:spreadsheet:read bitable:app:read',
          }), '');
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

    it('returns failure when token valid but missing required scopes', async () => {
      mockExec
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, 'lark-cli/1.2.3\n', '');
          return mockChild();
        })
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, JSON.stringify({ tokenStatus: 'valid', scope: 'drive:file:upload drive:drive.metadata:readonly' }), '');
          return mockChild();
        });
      const bridge = new FeishuCliBridge();
      const result = await bridge.preflight();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('INSUFFICIENT_SCOPE');
        expect(result.error).toContain('Missing required scopes');
        expect(result.error).toContain('docx:document:readonly');
      }
    });

    it('returns failure when token valid but scope field is missing', async () => {
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
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('INSUFFICIENT_SCOPE');
      }
    });

    it('returns failure when token valid but scope is empty string', async () => {
      mockExec
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, 'lark-cli/1.2.3\n', '');
          return mockChild();
        })
        .mockImplementationOnce((cmd: string, opts: any, cb: Function) => {
          cb(null, JSON.stringify({ tokenStatus: 'valid', scope: '' }), '');
          return mockChild();
        });
      const bridge = new FeishuCliBridge();
      const result = await bridge.preflight();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('INSUFFICIENT_SCOPE');
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
      const result = await bridge.uploadFile('notes/hello.md', 'folderABC', 'hello.md', '/my/vault');
      expect(result.fileToken).toBe('ftok123');
      expect(result.url).toBe('https://drive.feishu.cn/file/ftok123');
    });

    it('constructs correct command with relative file path and cwd', async () => {
      let usedCommand = '';
      let usedOpts: any;
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        usedOpts = opts;
        cb(null, JSON.stringify({ data: { file_token: 'ftok', url: '' } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.uploadFile('notes/hello.md', 'parentToken', 'hello.md', '/my/vault');
      expect(usedCommand).toContain('drive +upload');
      expect(usedCommand).toContain('--file "notes/hello.md"');
      expect(usedCommand).toContain('--folder-token "parentToken"');
      expect(usedCommand).toContain('--name "hello.md"');
      expect(usedOpts.cwd).toBe('/my/vault');
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
      expect(usedCommand).toContain('--folder-token "rootToken"');
      expect(usedCommand).toContain('--name "subdir"');
    });
  });

  describe('findSubfolder', () => {
    it('returns folder token when matching folder found', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({
          data: {
            files: [
              { name: 'Clippings', token: 'fld_existing', type: 'folder' },
              { name: 'note.md', token: 'ftok_note', type: 'file' },
            ],
          },
        }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.findSubfolder('parentToken', 'Clippings');
      expect(result).toBe('fld_existing');
    });

    it('returns null when no matching folder found', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({
          data: {
            files: [
              { name: 'note.md', token: 'ftok_note', type: 'file' },
            ],
          },
        }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.findSubfolder('parentToken', 'Nonexistent');
      expect(result).toBeNull();
    });

    it('constructs correct list command with folder token', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, JSON.stringify({ data: { files: [] } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.findSubfolder('parent123', 'test');
      expect(usedCommand).toContain('drive files list');
      expect(usedCommand).toContain('--params "{\\"folder_token\\":\\"parent123\\"}"');
      expect(usedCommand).toContain('--page-all');
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
      expect(usedCommand).toContain('--file-token "ftok789"');
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
      expect(usedCommand).toContain('--file-token "ftok123"');
      expect(usedCommand).toContain('--folder-token "newFolder456"');
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
      const resultPromise = bridge.uploadFile('f.md', 'fld', 'f.md', '/vault');
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
      await expect(bridge.uploadFile('f.md', 'fld', 'f.md', '/vault')).rejects.toThrow(CliNotFoundError);
    });
  });

  describe('listRemoteFiles', () => {
    it('returns parsed RemoteFile list from JSON response', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({
          data: {
            files: [
              { name: 'note.md', token: 'ftok1', type: 'file', modified_at: '2026-05-04T10:00:00Z' },
              { name: 'doc', token: 'ftok2', type: 'docx', modified_at: '2026-05-04T11:00:00Z' },
            ],
          },
        }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.listRemoteFiles('folderToken');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('note.md');
      expect(result[0].token).toBe('ftok1');
      expect(result[0].type).toBe('file');
      expect(result[0].modifiedAt).toBe('2026-05-04T10:00:00Z');
      expect(result[1].type).toBe('docx');
    });

    it('constructs correct command with folder token', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, JSON.stringify({ data: { files: [] } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.listRemoteFiles('fld123');
      expect(usedCommand).toContain('drive files list');
      expect(usedCommand).toContain('--params');
      expect(usedCommand).toContain('folder_token');
      expect(usedCommand).toContain('--page-all');
    });

    it('returns empty array when no files found', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({ data: { files: [] } }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.listRemoteFiles('emptyFld');
      expect(result).toEqual([]);
    });

    it('handles missing data field gracefully', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({}), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.listRemoteFiles('noDataFld');
      expect(result).toEqual([]);
    });
  });

  describe('getFileMetadata', () => {
    it('returns parsed RemoteFile from response', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({
          data: {
            file: { name: 'test.md', token: 'ftok999', type: 'file', modified_at: '2026-05-04T12:00:00Z' },
          },
        }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.getFileMetadata('ftok999');
      expect(result.name).toBe('test.md');
      expect(result.token).toBe('ftok999');
      expect(result.type).toBe('file');
      expect(result.modifiedAt).toBe('2026-05-04T12:00:00Z');
    });

    it('throws when file data is missing', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, JSON.stringify({ data: {} }), '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await expect(bridge.getFileMetadata('badToken')).rejects.toThrow(ApiError);
    });
  });

  describe('downloadFile', () => {
    it('resolves without error on success', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, '{}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await expect(bridge.downloadFile('ftok555', '/tmp/output.md')).resolves.not.toThrow();
    });

    it('constructs correct command', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, '{}', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.downloadFile('ftok555', '/tmp/output.md');
      expect(usedCommand).toContain('drive +download');
      expect(usedCommand).toContain('--file-token "ftok555"');
      expect(usedCommand).toContain('--output "/tmp/output.md"');
    });
  });

  describe('exportDoc', () => {
    it('returns markdown content from export command', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        cb(null, '# Exported\n\nHello world', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      const result = await bridge.exportDoc('docToken', 'docx');
      expect(result).toBe('# Exported\n\nHello world');
    });

    it('constructs correct command', async () => {
      let usedCommand = '';
      mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
        usedCommand = cmd;
        cb(null, '# Exported', '');
        return mockChild();
      });
      const bridge = new FeishuCliBridge();
      await bridge.exportDoc('docTokenABC', 'sheet');
      expect(usedCommand).toContain('drive +export');
      expect(usedCommand).toContain('--file-token "docTokenABC"');
      expect(usedCommand).toContain('--doc-type "sheet"');
      expect(usedCommand).toContain('--output-format "md"');
    });
  });
});
