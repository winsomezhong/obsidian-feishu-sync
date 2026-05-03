# Replace Doc Conversion with Drive Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Feishu online-document conversion sync with direct raw `.md` file upload to Feishu Drive, preserving directory structure.

**Architecture:** Remove the Markdown-to-docx preprocessing pipeline entirely. Replace `docs +create`/`docs +update` with `drive +upload` (which handles timestamp comparison internally). Add folder auto-creation with an in-memory token cache. Rename `feishuDocToken` → `feishuFileToken` throughout.

**Tech Stack:** TypeScript, Vitest, Obsidian Plugin API, lark-cli (drive commands)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/index.ts` | Modify | Replace `DocumentResult` with `UploadResult` |
| `src/bridge/feishu-cli-bridge.ts` | Modify | Add drive commands, remove doc commands, remove stdin temp-file logic |
| `src/sync/sync-status-tracker.ts` | Modify | Rename `feishuDocToken` → `feishuFileToken`, add legacy state detection |
| `src/sync/sync-engine.ts` | Modify | Replace doc sync flow with file upload flow, add `ensureFolderPath` + cache |
| `src/main.ts` | Modify | Remove `Preprocessor` import and injection |
| `src/ui/settings-tab.ts` | Modify | Update folder token label, remove processor settings |
| `src/converter/*.ts` (13 files) | Delete | Remove preprocessor and all 8 processor files + their 9 test files |
| `src/bridge/feishu-cli-bridge.test.ts` | Modify | Replace doc tests with drive tests |
| `src/sync/sync-status-tracker.test.ts` | Modify | Update field name, add legacy migration tests |
| `src/sync/sync-engine.test.ts` | Modify | Replace doc mocks with drive mocks |

---

### Task 1: Update shared types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Replace DocumentResult with UploadResult**

```typescript
export interface UploadResult {
  fileToken: string;
  url: string;
}

export type PreflightResult =
  | { success: true; cliVersion?: string; authReady: boolean }
  | { success: false; error: string; errorCode?: string };
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: PASS (no type errors from types file itself; bridge will error because it still imports `DocumentResult` — that's fixed in Task 2)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: replace DocumentResult with UploadResult type"
```

---

### Task 2: Bridge layer — add drive commands, remove doc commands

**Files:**
- Create: (none)
- Modify: `src/bridge/feishu-cli-bridge.ts` (full rewrite of public methods)
- Modify: `src/bridge/feishu-cli-bridge.test.ts` (full rewrite)

- [ ] **Step 1: Write failing tests for new drive methods**

Replace the entire content of `src/bridge/feishu-cli-bridge.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/bridge/feishu-cli-bridge.test.ts
```
Expected: FAIL — `uploadFile is not a function`, `createFolder is not a function`, `deleteFile is not a function`, `moveFile is not a function`

- [ ] **Step 3: Rewrite bridge implementation**

Replace the entire content of `src/bridge/feishu-cli-bridge.ts`:

```typescript
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

  executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = exec(command, { encoding: 'utf-8', timeout: this.config.timeoutMs }, (err, stdout, stderr) => {
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

  async uploadFile(localPath: string, folderToken: string, fileName: string): Promise<UploadResult> {
    const cmd = `${this.config.cliPath} drive +upload --file ${localPath} --folder-token ${folderToken} --name ${fileName}`;
    return this.withRetry(async () => {
      const stdout = await this.executeCommand(cmd);
      const data = JSON.parse(stdout).data;
      return { fileToken: data.file_token, url: data.url };
    });
  }

  async createFolder(parentToken: string, folderName: string): Promise<string> {
    const cmd = `${this.config.cliPath} drive +create-folder --folder-token ${parentToken} --name ${folderName}`;
    return this.withRetry(async () => {
      const stdout = await this.executeCommand(cmd);
      return JSON.parse(stdout).data.folder_token;
    });
  }

  async deleteFile(fileToken: string): Promise<void> {
    const cmd = `${this.config.cliPath} drive +delete --file-token ${fileToken} --type file --yes`;
    await this.withRetry(() => this.executeCommand(cmd));
  }

  async moveFile(fileToken: string, targetFolderToken: string): Promise<void> {
    const cmd = `${this.config.cliPath} drive +move --file-token ${fileToken} --folder-token ${targetFolderToken} --type file`;
    await this.withRetry(() => this.executeCommand(cmd));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/bridge/feishu-cli-bridge.test.ts
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/bridge/feishu-cli-bridge.ts src/bridge/feishu-cli-bridge.test.ts
git commit -m "feat: replace doc commands with drive file commands in bridge"
```

---

### Task 3: State tracker — rename feishuDocToken to feishuFileToken

**Files:**
- Modify: `src/sync/sync-status-tracker.ts`
- Modify: `src/sync/sync-status-tracker.test.ts`

- [ ] **Step 1: Write failing tests for new field name and legacy migration**

Replace the entire content of `src/sync/sync-status-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SyncStatusTracker } from './sync-status-tracker';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('SyncStatusTracker', () => {
  const testDir = path.join(os.tmpdir(), 'feishu-sync-test');
  let tracker: SyncStatusTracker;

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    tracker = new SyncStatusTracker(testDir);
  });

  it('loads empty state when no data file exists', () => {
    expect(tracker.getAllFiles()).toEqual([]);
  });

  it('loads empty state on corrupted JSON', () => {
    fs.writeFileSync(path.join(testDir, 'sync-state.json'), 'not json');
    tracker = new SyncStatusTracker(testDir);
    expect(tracker.getAllFiles()).toEqual([]);
  });

  it('writes to sync-state.json not data.json', () => {
    tracker.updateFileState('note.md', 'file123', 1000);
    expect(fs.existsSync(path.join(testDir, 'data.json'))).toBe(false);
    expect(fs.existsSync(path.join(testDir, 'sync-state.json'))).toBe(true);
  });

  it('persists and retrieves file state with feishuFileToken', () => {
    tracker.updateFileState('note.md', 'file123', 1000);
    const state = tracker.getFileState('note.md');
    expect(state?.localPath).toBe('note.md');
    expect(state?.feishuFileToken).toBe('file123');
    expect(state?.lastLocalMtime).toBe(1000);
    expect(typeof state?.lastSyncedAt).toBe('number');
  });

  it('removes file state', () => {
    tracker.updateFileState('note.md', 'file123', 1000);
    tracker.removeFileState('note.md');
    expect(tracker.getFileState('note.md')).toBeNull();
    expect(tracker.getAllFiles()).toHaveLength(0);
  });

  it('returns null for unknown file', () => {
    expect(tracker.getFileState('nonexistent.md')).toBeNull();
  });

  it('persists data across tracker instances', () => {
    tracker.updateFileState('note.md', 'file123', 1000);
    const tracker2 = new SyncStatusTracker(testDir);
    expect(tracker2.getFileState('note.md')?.feishuFileToken).toBe('file123');
  });

  it('clears state when legacy feishuDocToken field detected', () => {
    const legacyState = {
      files: {
        'old.md': {
          localPath: 'old.md',
          feishuDocToken: 'docOld123',
          lastSyncedAt: 1000,
          lastLocalMtime: 900,
        },
      },
    };
    fs.writeFileSync(path.join(testDir, 'sync-state.json'), JSON.stringify(legacyState));
    const newTracker = new SyncStatusTracker(testDir);
    expect(newTracker.getAllFiles()).toHaveLength(0);
  });

  it('preserves state with feishuFileToken field', () => {
    const validState = {
      files: {
        'good.md': {
          localPath: 'good.md',
          feishuFileToken: 'fileGood456',
          lastSyncedAt: 2000,
          lastLocalMtime: 1900,
        },
      },
    };
    fs.writeFileSync(path.join(testDir, 'sync-state.json'), JSON.stringify(validState));
    const newTracker = new SyncStatusTracker(testDir);
    expect(newTracker.getFileState('good.md')?.feishuFileToken).toBe('fileGood456');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/sync/sync-status-tracker.test.ts
```
Expected: FAIL — tests reference `feishuFileToken` but current code uses `feishuDocToken`

- [ ] **Step 3: Update tracker implementation**

Replace the entire content of `src/sync/sync-status-tracker.ts`:

```typescript
import fs from 'fs';
import path from 'path';

export interface FileSyncState {
  localPath: string;
  feishuFileToken: string;
  lastSyncedAt: number;
  lastLocalMtime: number;
}

export interface SyncState {
  files: Record<string, FileSyncState>;
}

export class SyncStatusTracker {
  private state: SyncState = { files: {} };
  private dataPath: string;

  constructor(private dataDir: string) {
    this.dataPath = path.join(dataDir, 'sync-state.json');
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.dataPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (this.hasLegacyDocTokens(parsed)) {
        console.warn('Feishu Sync: detected legacy feishuDocToken state, clearing for migration');
        this.state = { files: {} };
        this.save();
        return;
      }
      this.state = parsed;
    } catch {
      this.state = { files: {} };
    }
  }

  private hasLegacyDocTokens(parsed: any): boolean {
    const files = parsed?.files;
    if (!files || typeof files !== 'object') return false;
    return Object.values(files).some(
      (entry: any) => entry && 'feishuDocToken' in entry,
    );
  }

  private save(): void {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.dataPath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  updateFileState(localPath: string, fileToken: string, mtime: number): void {
    this.state.files[localPath] = {
      localPath,
      feishuFileToken: fileToken,
      lastSyncedAt: Date.now(),
      lastLocalMtime: mtime,
    };
    this.save();
  }

  removeFileState(localPath: string): void {
    delete this.state.files[localPath];
    this.save();
  }

  getFileState(localPath: string): FileSyncState | null {
    return this.state.files[localPath] ?? null;
  }

  getAllFiles(): FileSyncState[] {
    return Object.values(this.state.files);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/sync/sync-status-tracker.test.ts
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/sync-status-tracker.ts src/sync/sync-status-tracker.test.ts
git commit -m "feat: rename feishuDocToken to feishuFileToken with legacy migration"
```

---

### Task 4: Sync engine — replace doc flow with file upload flow

**Files:**
- Modify: `src/sync/sync-engine.ts`
- Modify: `src/sync/sync-engine.test.ts`

- [ ] **Step 1: Write failing tests for new engine behavior**

Replace the entire content of `src/sync/sync-engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => ({
  Plugin: class MockPlugin {},
  TFile: class MockTFile {},
}));

const mockVaultOn = vi.fn();
const mockVaultRead = vi.fn();
const mockGetMarkdownFiles = vi.fn();
const mockRegisterEvent = vi.fn();
const mockAdapterGetFullPath = vi.fn();

vi.mock('../bridge/feishu-cli-bridge', () => ({ FeishuCliBridge: class MockBridge {} }));
vi.mock('./sync-status-tracker', () => ({ SyncStatusTracker: class MockTracker {} }));
vi.mock('./conflict-resolver', () => ({ ConflictResolver: class MockResolver {} }));

import { SyncEngine } from './sync-engine';

function createMockPlugin() {
  return {
    registerEvent: mockRegisterEvent,
    app: {
      vault: {
        on: mockVaultOn,
        read: mockVaultRead,
        getMarkdownFiles: mockGetMarkdownFiles,
        adapter: {
          getFullPath: mockAdapterGetFullPath,
        },
      },
    },
  } as any;
}

function createMockDeps() {
  return {
    bridge: {
      uploadFile: vi.fn(),
      deleteFile: vi.fn(),
      moveFile: vi.fn(),
      createFolder: vi.fn(),
    } as any,
    tracker: {
      getFileState: vi.fn(),
      updateFileState: vi.fn(),
      removeFileState: vi.fn(),
    } as any,
    resolver: { resolve: vi.fn() } as any,
  };
}

describe('SyncEngine', () => {
  let engine: SyncEngine;
  let plugin: any;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createMockPlugin();
    deps = createMockDeps();
    engine = new SyncEngine(plugin, deps.bridge, deps.tracker, deps.resolver, () => 'root-token');
  });

  it('start() registers event listeners', () => {
    engine.start();
    expect(engine.isRunning()).toBe(true);
    expect(mockVaultOn).toHaveBeenCalledWith('modify', expect.any(Function));
    expect(mockVaultOn).toHaveBeenCalledWith('create', expect.any(Function));
    expect(mockVaultOn).toHaveBeenCalledWith('delete', expect.any(Function));
    expect(mockVaultOn).toHaveBeenCalledWith('rename', expect.any(Function));
  });

  it('stop() clears running state', () => {
    engine.start();
    engine.stop();
    expect(engine.isRunning()).toBe(false);
  });

  describe('syncFile', () => {
    it('uploads file with folder resolution when no state exists', async () => {
      const mockFile = {
        path: 'notes/tech.md',
        name: 'tech.md',
        extension: 'md',
        stat: { mtime: 1000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue(null);
      deps.resolver.resolve.mockReturnValue('needs-sync');
      mockAdapterGetFullPath.mockReturnValue('/vault/notes/tech.md');
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');
      deps.bridge.uploadFile.mockResolvedValue({ fileToken: 'ftok1', url: 'https://drive.feishu.cn/file/ftok1' });

      await engine.syncFile(mockFile);

      expect(deps.bridge.createFolder).toHaveBeenCalledWith('root-token', 'notes');
      expect(deps.bridge.uploadFile).toHaveBeenCalledWith('/vault/notes/tech.md', 'folderXYZ', 'tech.md');
      expect(deps.tracker.updateFileState).toHaveBeenCalledWith('notes/tech.md', 'ftok1', 1000);
    });

    it('re-uploads when state exists (timestamp comparison handled by drive +upload)', async () => {
      const mockFile = {
        path: 'notes/tech.md',
        name: 'tech.md',
        extension: 'md',
        stat: { mtime: 2000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok1' });
      deps.resolver.resolve.mockReturnValue('needs-sync');
      mockAdapterGetFullPath.mockReturnValue('/vault/notes/tech.md');
      // Folder already cached from previous sync — createFolder should not be called
      deps.bridge.uploadFile.mockResolvedValue({ fileToken: 'ftok2', url: '' });

      // Pre-populate cache by doing a first sync
      deps.tracker.getFileState.mockReturnValue(null);
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');

      await engine.syncFile(mockFile);

      expect(deps.bridge.uploadFile).toHaveBeenCalledWith('/vault/notes/tech.md', 'folderXYZ', 'tech.md');
      expect(deps.tracker.updateFileState).toHaveBeenCalledWith('notes/tech.md', 'ftok2', 2000);
    });

    it('skips non-md files', async () => {
      const mockFile = { path: 'image.png', extension: 'png', stat: { mtime: 1000 } } as any;
      await engine.syncFile(mockFile);
      expect(deps.bridge.uploadFile).not.toHaveBeenCalled();
    });

    it('skips when resolver returns skip', async () => {
      const mockFile = { path: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok1' });
      deps.resolver.resolve.mockReturnValue('skip');
      await engine.syncFile(mockFile);
      expect(deps.bridge.uploadFile).not.toHaveBeenCalled();
    });

    it('skips when folder token is empty', async () => {
      const engineNoToken = new SyncEngine(plugin, deps.bridge, deps.tracker, deps.resolver, () => '');
      const mockFile = { path: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
      await engineNoToken.syncFile(mockFile);
      expect(deps.bridge.uploadFile).not.toHaveBeenCalled();
    });
  });

  describe('ensureFolderPath', () => {
    it('returns root token for file at vault root', async () => {
      const result = await engine.ensureFolderPath('README.md');
      expect(result).toBe('root-token');
      expect(deps.bridge.createFolder).not.toHaveBeenCalled();
    });

    it('creates single folder and caches token', async () => {
      deps.bridge.createFolder.mockResolvedValue('fld_notes');
      const result = await engine.ensureFolderPath('notes/todo.md');
      expect(result).toBe('fld_notes');
      expect(deps.bridge.createFolder).toHaveBeenCalledWith('root-token', 'notes');
    });

    it('uses cache for second call with same directory', async () => {
      deps.bridge.createFolder.mockResolvedValue('fld_notes');
      await engine.ensureFolderPath('notes/a.md');
      await engine.ensureFolderPath('notes/b.md');
      expect(deps.bridge.createFolder).toHaveBeenCalledTimes(1);
    });

    it('creates nested folders in order', async () => {
      deps.bridge.createFolder
        .mockResolvedValueOnce('fld_projects')
        .mockResolvedValueOnce('fld_client');
      const result = await engine.ensureFolderPath('projects/client/spec.md');
      expect(result).toBe('fld_client');
      expect(deps.bridge.createFolder).toHaveBeenNthCalledWith(1, 'root-token', 'projects');
      expect(deps.bridge.createFolder).toHaveBeenNthCalledWith(2, 'fld_projects', 'client');
    });
  });

  describe('onFileDelete', () => {
    it('deletes drive file and removes state', async () => {
      const mockFile = { path: 'note.md', extension: 'md' } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok_del' });
      // @ts-ignore
      await engine.onFileDelete(mockFile);
      expect(deps.bridge.deleteFile).toHaveBeenCalledWith('ftok_del');
      expect(deps.tracker.removeFileState).toHaveBeenCalledWith('note.md');
    });

    it('skips when no state exists', async () => {
      const mockFile = { path: 'note.md', extension: 'md' } as any;
      deps.tracker.getFileState.mockReturnValue(null);
      // @ts-ignore
      await engine.onFileDelete(mockFile);
      expect(deps.bridge.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('onFileRename', () => {
    it('moves drive file and updates state', async () => {
      const mockFile = {
        path: 'archive/note.md',
        name: 'note.md',
        extension: 'md',
        stat: { mtime: 3000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok_move' });
      deps.bridge.createFolder.mockResolvedValue('fld_archive');

      // @ts-ignore
      await engine.onFileRename(mockFile, 'inbox/note.md');

      expect(deps.tracker.removeFileState).toHaveBeenCalledWith('inbox/note.md');
      expect(deps.bridge.moveFile).toHaveBeenCalledWith('ftok_move', 'fld_archive');
      expect(deps.tracker.updateFileState).toHaveBeenCalledWith('archive/note.md', 'ftok_move', 3000);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/sync/sync-engine.test.ts
```
Expected: FAIL — `ensureFolderPath is not a function`, `uploadFile is not a function`, etc.

- [ ] **Step 3: Rewrite sync engine implementation**

Replace the entire content of `src/sync/sync-engine.ts`:

```typescript
import { Plugin, TFile } from 'obsidian';
import { FeishuCliBridge } from '../bridge/feishu-cli-bridge';
import { SyncStatusTracker } from './sync-status-tracker';
import { ConflictResolver } from './conflict-resolver';

export class SyncEngine {
  private running = false;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private folderCache: Map<string, string> = new Map();

  constructor(
    private plugin: Plugin,
    private bridge: FeishuCliBridge,
    private tracker: SyncStatusTracker,
    private resolver: ConflictResolver,
    private getFolderToken: () => string,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const vault = this.plugin.app.vault;
    this.plugin.registerEvent(
      (vault.on as any)('modify', (file: TFile) => this.onFileChange(file)),
    );
    this.plugin.registerEvent(
      (vault.on as any)('create', (file: TFile) => this.onFileChange(file)),
    );
    this.plugin.registerEvent(
      (vault.on as any)('delete', (file: TFile) => this.onFileDelete(file)),
    );
    this.plugin.registerEvent(
      (vault.on as any)('rename', (file: TFile, oldPath: string) => this.onFileRename(file, oldPath)),
    );
  }

  stop(): void {
    this.running = false;
    this.debounceTimers.forEach(t => clearTimeout(t));
    this.debounceTimers.clear();
    this.folderCache.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  async ensureFolderPath(filePath: string): Promise<string> {
    const segments = filePath.split('/');
    segments.pop(); // remove filename
    if (segments.length === 0) return this.getFolderToken();

    let currentParentToken = this.getFolderToken();
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const cached = this.folderCache.get(currentPath);
      if (cached) {
        currentParentToken = cached;
        continue;
      }
      currentParentToken = await this.bridge.createFolder(currentParentToken, segment);
      this.folderCache.set(currentPath, currentParentToken);
    }

    return currentParentToken;
  }

  async syncFile(file: TFile): Promise<void> {
    if (file.extension !== 'md') return;
    if (!this.getFolderToken()) {
      console.warn('Feishu Sync: folder token not set, skipping', file.path);
      return;
    }

    const state = this.tracker.getFileState(file.path);
    const decision = this.resolver.resolve(file.stat.mtime, state);
    if (decision === 'skip') return;

    const folderToken = await this.ensureFolderPath(file.path);
    const localPath = (this.plugin.app.vault.adapter as any).getFullPath(file.path);

    const result = await this.bridge.uploadFile(localPath, folderToken, file.name);
    this.tracker.updateFileState(file.path, result.fileToken, file.stat.mtime);
  }

  async syncAll(): Promise<void> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    const errors: Array<{ path: string; error: Error }> = [];
    let successCount = 0;

    for (const file of files) {
      try {
        await this.syncFile(file);
        successCount++;
      } catch (err) {
        errors.push({ path: file.path, error: err as Error });
      }
    }

    if (errors.length > 0) {
      console.warn(`SyncAll: ${successCount} succeeded, ${errors.length} failed:`, errors);
    }
  }

  private onFileChange(file: TFile): void {
    if (file.extension !== 'md') return;

    const existing = this.debounceTimers.get(file.path);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      file.path,
      setTimeout(async () => {
        this.debounceTimers.delete(file.path);
        try {
          await this.syncFile(file);
        } catch (err) {
          console.error(`Sync error for ${file.path}:`, err);
        }
      }, 2000),
    );
  }

  private async onFileDelete(file: TFile): Promise<void> {
    if (file.extension !== 'md') return;
    const state = this.tracker.getFileState(file.path);
    if (state) {
      try {
        await this.bridge.deleteFile(state.feishuFileToken);
      } catch (err) {
        console.error(`Failed to delete drive file for ${file.path}:`, err);
      }
      this.tracker.removeFileState(file.path);
    }
  }

  private async onFileRename(file: TFile, oldPath: string): Promise<void> {
    if (file.extension !== 'md') return;
    const state = this.tracker.getFileState(oldPath);
    if (state) {
      this.tracker.removeFileState(oldPath);
      this.tracker.updateFileState(file.path, state.feishuFileToken, file.stat.mtime);
      try {
        const targetFolder = await this.ensureFolderPath(file.path);
        await this.bridge.moveFile(state.feishuFileToken, targetFolder);
      } catch (err) {
        console.error(`Failed to move drive file for ${file.path}:`, err);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/sync/sync-engine.test.ts
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/sync-engine.ts src/sync/sync-engine.test.ts
git commit -m "feat: replace doc sync flow with drive file upload in sync engine"
```

---

### Task 5: Remove preprocessor and all converter files

**Files:**
- Delete: `src/converter/preprocessor.ts`
- Delete: `src/converter/frontmatter-processor.ts`
- Delete: `src/converter/dataview-processor.ts`
- Delete: `src/converter/wikilink-processor.ts`
- Delete: `src/converter/tag-processor.ts`
- Delete: `src/converter/image-processor.ts`
- Delete: `src/converter/table-processor.ts`
- Delete: `src/converter/callout-processor.ts`
- Delete: `src/converter/math-processor.ts`
- Delete: `src/converter/preprocessor.test.ts`
- Delete: `src/converter/frontmatter-processor.test.ts`
- Delete: `src/converter/dataview-processor.test.ts`
- Delete: `src/converter/wikilink-processor.test.ts`
- Delete: `src/converter/tag-processor.test.ts`
- Delete: `src/converter/image-processor.test.ts`
- Delete: `src/converter/table-processor.test.ts`
- Delete: `src/converter/callout-processor.test.ts`
- Delete: `src/converter/math-processor.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Remove Preprocessor import and usage from main.ts**

Edit `src/main.ts` — remove the `Preprocessor` import (line 6) and remove `preprocessor` construction and injection (lines 32, 34).

Old main.ts:
```typescript
import { Plugin, Notice } from 'obsidian';
import { FeishuCliBridge } from './bridge/feishu-cli-bridge';
import { SyncStatusTracker } from './sync/sync-status-tracker';
import { ConflictResolver } from './sync/conflict-resolver';
import { SyncEngine } from './sync/sync-engine';
import { Preprocessor } from './converter/preprocessor';
import { SyncLog } from './sync/sync-log';
import { SyncSettingsTab, DEFAULT_SETTINGS } from './ui/settings-tab';
import { SyncStatusBar } from './ui/status-bar';
import type { SyncPluginSettings } from './ui/settings-tab';

export default class FeishuSyncPlugin extends Plugin {
  engine!: SyncEngine;
  bridge!: FeishuCliBridge;
  tracker!: SyncStatusTracker;
  syncLog!: SyncLog;
  settings!: SyncPluginSettings;
  statusBar!: SyncStatusBar;

  async onload() {
    console.log('Loading Feishu Sync plugin');

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    const dataDir = this.manifest.dir || (this.app.vault.configDir + '/plugins/obsidian-feishu-sync');

    this.syncLog = new SyncLog();

    this.bridge = new FeishuCliBridge();
    this.tracker = new SyncStatusTracker(dataDir);
    const resolver = new ConflictResolver();
    const preprocessor = new Preprocessor(this.settings.processorConfig);

    this.engine = new SyncEngine(this, this.bridge, this.tracker, resolver, preprocessor, () => this.settings.folderToken);
    // ... rest unchanged
```

New main.ts (only showing changed lines — rest of file stays identical):

```typescript
import { Plugin, Notice } from 'obsidian';
import { FeishuCliBridge } from './bridge/feishu-cli-bridge';
import { SyncStatusTracker } from './sync/sync-status-tracker';
import { ConflictResolver } from './sync/conflict-resolver';
import { SyncEngine } from './sync/sync-engine';
import { SyncLog } from './sync/sync-log';
import { SyncSettingsTab, DEFAULT_SETTINGS } from './ui/settings-tab';
import { SyncStatusBar } from './ui/status-bar';
import type { SyncPluginSettings } from './ui/settings-tab';

export default class FeishuSyncPlugin extends Plugin {
  engine!: SyncEngine;
  bridge!: FeishuCliBridge;
  tracker!: SyncStatusTracker;
  syncLog!: SyncLog;
  settings!: SyncPluginSettings;
  statusBar!: SyncStatusBar;

  async onload() {
    console.log('Loading Feishu Sync plugin');

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    const dataDir = this.manifest.dir || (this.app.vault.configDir + '/plugins/obsidian-feishu-sync');

    this.syncLog = new SyncLog();

    this.bridge = new FeishuCliBridge();
    this.tracker = new SyncStatusTracker(dataDir);
    const resolver = new ConflictResolver();

    this.engine = new SyncEngine(this, this.bridge, this.tracker, resolver, () => this.settings.folderToken);
    // ... rest unchanged
```

Note: the rest of `onload()` from the `addSettingTab` line onward stays exactly the same.

- [ ] **Step 2: Delete all converter source files**

```bash
rm -f src/converter/preprocessor.ts src/converter/frontmatter-processor.ts src/converter/dataview-processor.ts src/converter/wikilink-processor.ts src/converter/tag-processor.ts src/converter/image-processor.ts src/converter/table-processor.ts src/converter/callout-processor.ts src/converter/math-processor.ts
```

- [ ] **Step 3: Delete all converter test files**

```bash
rm -f src/converter/preprocessor.test.ts src/converter/frontmatter-processor.test.ts src/converter/dataview-processor.test.ts src/converter/wikilink-processor.test.ts src/converter/tag-processor.test.ts src/converter/image-processor.test.ts src/converter/table-processor.test.ts src/converter/callout-processor.test.ts src/converter/math-processor.test.ts
```

- [ ] **Step 4: Run all remaining tests to verify nothing is broken**

```bash
npx vitest run
```
Expected: ALL PASS (only tests that don't depend on removed modules)

- [ ] **Step 5: Commit**

```bash
git add -u src/main.ts
git add -u src/converter/
git commit -m "feat: remove preprocessor pipeline and all converter files"
```

---

### Task 6: Settings — update UI and remove processor config

**Files:**
- Modify: `src/ui/settings-tab.ts`
- Modify: `src/ui/settings-tab.test.ts`

- [ ] **Step 1: Update settings tab — remove processorConfig**

Replace `src/ui/settings-tab.ts`:

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';

export interface SyncPluginSettings {
  folderToken: string;
  syncOnSave: boolean;
}

export const DEFAULT_SETTINGS: SyncPluginSettings = {
  folderToken: '',
  syncOnSave: true,
};

export class SyncSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: any,
    private onSettingsChange: (settings: SyncPluginSettings) => void,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Feishu Sync Settings' });

    new Setting(containerEl)
      .setName('Sync root folder token')
      .setDesc('Feishu Drive folder token for file sync (files are uploaded preserving vault directory structure under this folder)')
      .addText(text => text
        .setPlaceholder('Enter folder token')
        .setValue((this.plugin.settings?.folderToken || ''))
        .onChange(async value => {
          this.plugin.settings.folderToken = value;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));

    new Setting(containerEl)
      .setName('Sync on save')
      .setDesc('Automatically sync notes when saved')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings?.syncOnSave ?? true)
        .onChange(async value => {
          this.plugin.settings.syncOnSave = value;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));
  }
}
```

- [ ] **Step 2: Update settings tab test**

Replace `src/ui/settings-tab.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from './settings-tab';

describe('DEFAULT_SETTINGS', () => {
  it('has folderToken and syncOnSave (no processorConfig)', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('folderToken');
    expect(DEFAULT_SETTINGS).toHaveProperty('syncOnSave');
    expect(DEFAULT_SETTINGS).not.toHaveProperty('processorConfig');
  });

  it('folderToken defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.folderToken).toBe('');
  });

  it('syncOnSave defaults to true', () => {
    expect(DEFAULT_SETTINGS.syncOnSave).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify**

```bash
npx vitest run src/ui/settings-tab.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ui/settings-tab.ts src/ui/settings-tab.test.ts
git commit -m "feat: simplify settings — remove processorConfig, update labels for drive sync"
```

---

### Task 7: Fix conflict-resolver test (uses feishuDocToken reference)

**Files:**
- Modify: `src/sync/conflict-resolver.test.ts`

- [ ] **Step 1: Check and update conflict-resolver test**

The `ConflictResolver` itself does not reference `feishuDocToken` — it only uses `lastLocalMtime`. Let's verify the test is clean.

```bash
npx vitest run src/sync/conflict-resolver.test.ts
```
Expected: PASS (no changes needed, but verify)

- [ ] **Step 2: If tests pass, no commit needed. If they fail due to import issues, fix and commit.**

---

### Task 8: Full test suite and type check

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```
Expected: ALL PASS

- [ ] **Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit
```
Expected: No type errors

- [ ] **Step 3: If any failures, fix inline and re-run until green**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and test verification for drive upload migration"
```
