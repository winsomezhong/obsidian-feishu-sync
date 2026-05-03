# folder-path-instead-of-token — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `folderToken` with `folderPath` in data model, UI, bridge, and engine — user enters human-readable folder path instead of cryptic token.

**Architecture:** `folderPath` is the user-facing setting string. `resolveFolderToken()` in FeishuCliBridge translates it to a token via lark-cli. SyncEngine caches the resolved token in-memory (keyed by path) and persists it to `resolvedFolderToken` in data.json. Legacy `folderToken` auto-migrates to `folderPath` on load.

**Tech Stack:** TypeScript, Obsidian Plugin API, vitest, lark-cli subprocess

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/index.ts` | Modify | Add `FolderResolutionResult`, update `PreflightResult` |
| `src/bridge/feishu-cli-bridge.ts` | Modify | Add `resolveFolderToken()`, `FolderNotFoundError`, `FolderAmbiguousError` |
| `src/sync/sync-engine.ts` | Modify | Replace `getFolderToken` with `getFolderPath` + `resolveFolderToken`, add cache logic |
| `src/ui/settings-tab.ts` | Modify | Rename `folderToken` → `folderPath`, add `resolvedFolderToken` to settings, update UI text |
| `src/main.ts` | Modify | Legacy migration, update SyncEngine/bridge construction, preflight wiring |
| `src/bridge/feishu-cli-bridge.test.ts` | Modify | Tests for `resolveFolderToken()`, new error classes |
| `src/sync/sync-engine.test.ts` | Modify | Updated constructor, cache hit/miss/invalidation tests |
| `src/ui/settings-tab.test.ts` | Modify | Updated defaults test for `folderPath`/`resolvedFolderToken` |

---

### Task 1: Types and error classes

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/bridge/feishu-cli-bridge.ts`

- [ ] **Step 1.1: Write the failing test for new error classes**

```typescript
// Add to src/bridge/feishu-cli-bridge.test.ts

// Add import for new error classes at top (line 3-10 area):
// FolderNotFoundError, FolderAmbiguousError are the new additions

it('FolderNotFoundError has correct name and message', () => {
  const err = new FolderNotFoundError('/path/to/folder');
  expect(err.name).toBe('FolderNotFoundError');
  expect(err.message).toContain('/path/to/folder');
  expect(err.folderPath).toBe('/path/to/folder');
});

it('FolderNotFoundError extends Error', () => {
  expect(new FolderNotFoundError('')).toBeInstanceOf(Error);
});

it('FolderAmbiguousError has correct name and lists matches', () => {
  const err = new FolderAmbiguousError('sync', ['/A/sync', '/B/sync']);
  expect(err.name).toBe('FolderAmbiguousError');
  expect(err.message).toContain('sync');
  expect(err.matches).toEqual(['/A/sync', '/B/sync']);
});

it('FolderAmbiguousError extends Error', () => {
  expect(new FolderAmbiguousError('x', [])).toBeInstanceOf(Error);
});
```

Run: `npx vitest run src/bridge/feishu-cli-bridge.test.ts -t "FolderNotFoundError|FolderAmbiguousError"`
Expected: FAIL — `FolderNotFoundError is not defined`

- [ ] **Step 1.2: Add FolderResolutionResult to types, implement error classes**

```typescript
// In src/types/index.ts, add after existing types:

export interface FolderResolutionResult {
  folderToken: string;
  resolvedPath: string;
}
```

```typescript
// In src/bridge/feishu-cli-bridge.ts, add after TimeoutError class (after line 28):

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
```

- [ ] **Step 1.3: Run tests to verify they pass**

Run: `npx vitest run src/bridge/feishu-cli-bridge.test.ts -t "FolderNotFoundError|FolderAmbiguousError"`
Expected: PASS (4 tests)

- [ ] **Step 1.4: Commit**

```bash
git add src/types/index.ts src/bridge/feishu-cli-bridge.ts src/bridge/feishu-cli-bridge.test.ts
git commit -m "feat: add FolderNotFoundError, FolderAmbiguousError, FolderResolutionResult"
```

---

### Task 2: Settings data model — folderPath + resolvedFolderToken

**Files:**
- Modify: `src/ui/settings-tab.ts`
- Modify: `src/ui/settings-tab.test.ts`

- [ ] **Step 2.1: Write the failing test for updated defaults**

```typescript
// In src/ui/settings-tab.test.ts, replace the folderToken test and add new ones:

it('has default folderPath as empty string', () => {
  expect(DEFAULT_SETTINGS.folderPath).toBe('');
});

it('has default resolvedFolderToken as empty string', () => {
  expect(DEFAULT_SETTINGS.resolvedFolderToken).toBe('');
});

it('legacy folderToken field no longer exists in defaults', () => {
  expect((DEFAULT_SETTINGS as any).folderToken).toBeUndefined();
});
```

Run: `npx vitest run src/ui/settings-tab.test.ts`
Expected: FAIL — `folderPath` and `resolvedFolderToken` don't exist yet on DEFAULT_SETTINGS

- [ ] **Step 2.2: Update SyncPluginSettings and DEFAULT_SETTINGS**

```typescript
// In src/ui/settings-tab.ts, update the interface:

export interface SyncPluginSettings {
  folderPath: string;
  resolvedFolderToken: string;
  processorConfig: ProcessorConfig;
  syncOnSave: boolean;
}

// Update DEFAULT_SETTINGS:

export const DEFAULT_SETTINGS: SyncPluginSettings = {
  folderPath: '',
  resolvedFolderToken: '',
  processorConfig: {
    frontmatter: 'strip',
    wikilink: 'keep-text',
    tag: 'keep-inline',
    dataview: 'comment-out',
    image: 'strip',
    tableMaxRows: 9,
    callout: 'strip-type',
    math: 'keep',
  },
  syncOnSave: true,
};
```

- [ ] **Step 2.3: Run tests to verify they pass**

Run: `npx vitest run src/ui/settings-tab.test.ts`
Expected: PASS

- [ ] **Step 2.4: Commit**

```bash
git add src/ui/settings-tab.ts src/ui/settings-tab.test.ts
git commit -m "feat: replace folderToken with folderPath + resolvedFolderToken in settings model"
```

---

### Task 3: Bridge — resolveFolderToken method

**Files:**
- Modify: `src/bridge/feishu-cli-bridge.ts`
- Modify: `src/bridge/feishu-cli-bridge.test.ts`

- [ ] **Step 3.1: Write failing tests for resolveFolderToken**

```typescript
// Add to src/bridge/feishu-cli-bridge.test.ts, inside the FeishuCliBridge describe block

describe('resolveFolderToken', () => {
  it('resolves absolute folder path to token', async () => {
    mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
      cb(null, JSON.stringify({ data: { folder_token: 'token-abc', path: '/My Docs/Sync' } }), '');
      return mockChild();
    });
    const bridge = new FeishuCliBridge();
    const token = await bridge.resolveFolderToken('/My Docs/Sync');
    expect(token).toBe('token-abc');
  });

  it('resolves single folder name', async () => {
    mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
      cb(null, JSON.stringify({ data: { folder_token: 'token-xyz', path: '/Sync' } }), '');
      return mockChild();
    });
    const bridge = new FeishuCliBridge();
    const token = await bridge.resolveFolderToken('Sync');
    expect(token).toBe('token-xyz');
  });

  it('throws FolderNotFoundError when folder does not exist', async () => {
    const err = new Error('command failed');
    mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
      cb(err, '', JSON.stringify({ code: 404, msg: 'folder not found' }));
      return mockChild();
    });
    const bridge = new FeishuCliBridge();
    await expect(bridge.resolveFolderToken('/nonexistent')).rejects.toThrow(FolderNotFoundError);
  });

  it('throws FolderAmbiguousError when multiple folders match', async () => {
    const err = new Error('command failed');
    mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
      cb(err, '', JSON.stringify({ code: 409, msg: 'ambiguous', data: { matches: ['/A/Sync', '/B/Sync'] } }));
      return mockChild();
    });
    const bridge = new FeishuCliBridge();
    await expect(bridge.resolveFolderToken('Sync')).rejects.toThrow(FolderAmbiguousError);
  });

  it('retries on transient errors with exponential backoff', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    mockExec.mockImplementation((cmd: string, opts: any, cb: Function) => {
      attempts++;
      if (attempts < 3) {
        const err = new Error('rate limited');
        cb(err, '', 'rate limited');
      } else {
        cb(null, JSON.stringify({ data: { folder_token: 'token-789', path: '/Sync' } }), '');
      }
      return mockChild();
    });
    const bridge = new FeishuCliBridge();
    const resultPromise = bridge.resolveFolderToken('Sync');
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(10000);
    const token = await resultPromise;
    expect(token).toBe('token-789');
    expect(attempts).toBe(3);
    vi.useRealTimers();
  });
});
```

Run: `npx vitest run src/bridge/feishu-cli-bridge.test.ts -t "resolveFolderToken"`
Expected: FAIL — `bridge.resolveFolderToken is not a function`

- [ ] **Step 3.2: Implement resolveFolderToken in FeishuCliBridge**

```typescript
// In src/bridge/feishu-cli-bridge.ts, add after createDocument method (after line 171):

async resolveFolderToken(folderPath: string): Promise<string> {
  const cmd = `${this.config.cliPath} drive +search --name ${this.escapeArg(folderPath)} --type folder`;
  return this.withRetry(async () => {
    try {
      const stdout = await this.executeCommand(cmd);
      const data = JSON.parse(stdout).data;
      if (!data || !data.folder_token) {
        throw new FolderNotFoundError(folderPath);
      }
      return data.folder_token;
    } catch (err) {
      if (err instanceof FolderNotFoundError || err instanceof FolderAmbiguousError) throw err;
      if (err instanceof ApiError && (err as ApiError).code === 'FOLDER_NOT_FOUND') {
        throw new FolderNotFoundError(folderPath);
      }
      if (err instanceof ApiError && (err as ApiError).code === 'FOLDER_AMBIGUOUS') {
        const stderrData = JSON.parse((err as Error).message || '{}');
        throw new FolderAmbiguousError(folderPath, stderrData.data?.matches || []);
      }
      throw err;
    }
  });
}

private escapeArg(arg: string): string {
  if (/^[a-zA-Z0-9_\-/.]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}
```

- [ ] **Step 3.3: Update existing bridge test imports for new exports**

```typescript
// In src/bridge/feishu-cli-bridge.test.ts line 3-10, update the import:
import {
  CliNotFoundError,
  AuthRequiredError,
  TimeoutError,
  ApiError,
  RateLimitError,
  FolderNotFoundError,
  FolderAmbiguousError,
  FeishuCliBridge,
} from './feishu-cli-bridge';
```

- [ ] **Step 3.4: Run resolveFolderToken tests**

Run: `npx vitest run src/bridge/feishu-cli-bridge.test.ts -t "resolveFolderToken"`
Expected: PASS (5 tests)

- [ ] **Step 3.5: Run all bridge tests to check for regressions**

Run: `npx vitest run src/bridge/feishu-cli-bridge.test.ts`
Expected: PASS (all tests)

- [ ] **Step 3.6: Commit**

```bash
git add src/bridge/feishu-cli-bridge.ts src/bridge/feishu-cli-bridge.test.ts
git commit -m "feat: add resolveFolderToken to FeishuCliBridge"
```

---

### Task 4: SyncEngine — folder path with caching

**Files:**
- Modify: `src/sync/sync-engine.ts`
- Modify: `src/sync/sync-engine.test.ts`

- [ ] **Step 4.1: Write failing tests for new SyncEngine constructor and cache logic**

Replace the SyncEngine test file with all existing tests updated for the new signature, plus new cache tests:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock obsidian module before importing SyncEngine
vi.mock('obsidian', () => ({
  Plugin: class MockPlugin {},
  TFile: class MockTFile {},
}));

const mockVaultOn = vi.fn();
const mockVaultRead = vi.fn();
const mockGetMarkdownFiles = vi.fn();
const mockRegisterEvent = vi.fn();

vi.mock('../bridge/feishu-cli-bridge', () => ({ FeishuCliBridge: class MockBridge {} }));
vi.mock('./sync-status-tracker', () => ({ SyncStatusTracker: class MockTracker {} }));
vi.mock('./conflict-resolver', () => ({ ConflictResolver: class MockResolver {} }));
vi.mock('../converter/preprocessor', () => ({ Preprocessor: class MockPreprocessor {} }));

import { SyncEngine } from './sync-engine';

function createMockPlugin() {
  return {
    registerEvent: mockRegisterEvent,
    app: {
      vault: {
        on: mockVaultOn,
        read: mockVaultRead,
        getMarkdownFiles: mockGetMarkdownFiles,
      },
    },
  } as any;
}

function createMockDeps() {
  return {
    bridge: { createDocument: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn() } as any,
    tracker: { getFileState: vi.fn(), updateFileState: vi.fn(), removeFileState: vi.fn() } as any,
    resolver: { resolve: vi.fn() } as any,
    preprocessor: { process: vi.fn().mockReturnValue({ content: 'processed', metadata: {} }) } as any,
  };
}

describe('SyncEngine', () => {
  let engine: SyncEngine;
  let plugin: any;
  let deps: ReturnType<typeof createMockDeps>;
  let resolveFolderToken: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createMockPlugin();
    deps = createMockDeps();
    resolveFolderToken = vi.fn();
    engine = new SyncEngine(
      plugin,
      deps.bridge,
      deps.tracker,
      deps.resolver,
      deps.preprocessor,
      () => '/My Docs/Sync',
      resolveFolderToken,
    );
  });

  it('start() registers event listeners', () => {
    engine.start();
    expect(engine.isRunning()).toBe(true);
    expect(mockVaultOn).toHaveBeenCalledWith('modify', expect.any(Function));
    expect(mockVaultOn).toHaveBeenCalledWith('create', expect.any(Function));
    expect(mockVaultOn).toHaveBeenCalledWith('delete', expect.any(Function));
    expect(mockVaultOn).toHaveBeenCalledWith('rename', expect.any(Function));
    expect(mockRegisterEvent).toHaveBeenCalledTimes(4);
  });

  it('start() is idempotent', () => {
    engine.start();
    engine.start();
    expect(mockRegisterEvent).toHaveBeenCalledTimes(4);
  });

  it('stop() clears running state and timers', () => {
    engine.start();
    engine.stop();
    expect(engine.isRunning()).toBe(false);
  });

  it('isRunning() returns false initially', () => {
    expect(engine.isRunning()).toBe(false);
  });

  it('syncFile creates new doc when no state exists', async () => {
    resolveFolderToken.mockResolvedValue('resolved-token-123');
    const mockFile = { path: 'note.md', name: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# Hello');
    deps.bridge.createDocument.mockResolvedValue({ documentId: 'doc1', url: 'https://feishu.cn/doc/doc1' });

    await engine.syncFile(mockFile);

    expect(resolveFolderToken).toHaveBeenCalledWith('/My Docs/Sync');
    expect(deps.bridge.createDocument).toHaveBeenCalledWith('note', '# note\n\nprocessed', 'resolved-token-123');
    expect(deps.tracker.updateFileState).toHaveBeenCalledWith('note.md', 'doc1', 1000);
  });

  it('syncFile updates existing doc when state exists', async () => {
    resolveFolderToken.mockResolvedValue('resolved-token-123');
    const mockFile = { path: 'note.md', name: 'note.md', extension: 'md', stat: { mtime: 2000 } } as any;
    deps.tracker.getFileState.mockReturnValue({ feishuDocToken: 'doc1' } as any);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# Updated');

    await engine.syncFile(mockFile);

    expect(deps.bridge.updateDocument).toHaveBeenCalledWith('doc1', expect.any(String));
    expect(deps.tracker.updateFileState).toHaveBeenCalledWith('note.md', 'doc1', 2000);
  });

  it('syncFile creates new doc when state exists but feishuDocToken is empty', async () => {
    resolveFolderToken.mockResolvedValue('resolved-token-123');
    const mockFile = { path: 'note.md', name: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
    deps.tracker.getFileState.mockReturnValue({ feishuDocToken: '' } as any);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# Hello');
    deps.bridge.createDocument.mockResolvedValue({ documentId: 'doc2', url: '' });

    await engine.syncFile(mockFile);

    expect(deps.bridge.createDocument).toHaveBeenCalledWith('note', '# note\n\nprocessed', 'resolved-token-123');
    expect(deps.bridge.updateDocument).not.toHaveBeenCalled();
  });

  it('syncFile skips file when resolver returns skip', async () => {
    resolveFolderToken.mockResolvedValue('resolved-token-123');
    const mockFile = { path: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
    deps.tracker.getFileState.mockReturnValue({ feishuDocToken: 'doc1' } as any);
    deps.resolver.resolve.mockReturnValue('skip');

    await engine.syncFile(mockFile);

    expect(deps.bridge.createDocument).not.toHaveBeenCalled();
    expect(deps.bridge.updateDocument).not.toHaveBeenCalled();
  });

  it('syncFile skips non-md files', async () => {
    const mockFile = { path: 'image.png', extension: 'png', stat: { mtime: 1000 } } as any;

    await engine.syncFile(mockFile);

    expect(deps.bridge.createDocument).not.toHaveBeenCalled();
    expect(deps.bridge.updateDocument).not.toHaveBeenCalled();
  });

  it('syncFile skips when folder path is empty', async () => {
    const emptyPathEngine = new SyncEngine(
      plugin, deps.bridge, deps.tracker, deps.resolver, deps.preprocessor,
      () => '', resolveFolderToken,
    );
    const mockFile = { path: 'note.md', name: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await emptyPathEngine.syncFile(mockFile);

    expect(consoleWarn).toHaveBeenCalled();
    expect(resolveFolderToken).not.toHaveBeenCalled();
    expect(deps.bridge.createDocument).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('caches resolved token and reuses on subsequent syncs', async () => {
    resolveFolderToken.mockResolvedValue('token-first-call');
    const mockFile = { path: 'a.md', name: 'a.md', extension: 'md', stat: { mtime: 1000 } } as any;
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# A');
    deps.bridge.createDocument.mockResolvedValue({ documentId: 'docA', url: '' });

    // First sync — resolves
    await engine.syncFile(mockFile);
    expect(resolveFolderToken).toHaveBeenCalledTimes(1);

    // Second sync — uses cache
    await engine.syncFile(mockFile);
    expect(resolveFolderToken).toHaveBeenCalledTimes(1); // still 1
  });

  it('re-resolves when folderPath changes', async () => {
    resolveFolderToken.mockResolvedValue('token-new');
    const mockFile = { path: 'a.md', name: 'a.md', extension: 'md', stat: { mtime: 1000 } } as any;
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# A');
    deps.bridge.createDocument.mockResolvedValue({ documentId: 'docA', url: '' });

    // First sync with path /A
    await engine.syncFile(mockFile);
    expect(resolveFolderToken).toHaveBeenCalledWith('/My Docs/Sync');

    // Reconstitute engine with different path
    const resolve2 = vi.fn().mockResolvedValue('token-different');
    const engine2 = new SyncEngine(
      plugin, deps.bridge, deps.tracker, deps.resolver, deps.preprocessor,
      () => '/Different/Path', resolve2,
    );
    await engine2.syncFile(mockFile);
    expect(resolve2).toHaveBeenCalledWith('/Different/Path');
  });

  it('syncAll iterates all markdown files', async () => {
    resolveFolderToken.mockResolvedValue('token');
    const files = [{ path: 'a.md', extension: 'md' }, { path: 'b.md', extension: 'md' }] as any[];
    mockGetMarkdownFiles.mockReturnValue(files);
    vi.spyOn(engine, 'syncFile').mockResolvedValue();

    await engine.syncAll();

    expect(engine.syncFile).toHaveBeenCalledTimes(2);
  });

  it('syncAll collects errors without throwing', async () => {
    resolveFolderToken.mockResolvedValue('token');
    const files = [{ path: 'a.md', extension: 'md' }] as any[];
    mockGetMarkdownFiles.mockReturnValue(files);
    vi.spyOn(engine, 'syncFile').mockRejectedValue(new Error('test error'));
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await engine.syncAll();

    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('onFileChange debounces rapid modifications', async () => {
    vi.useFakeTimers();
    resolveFolderToken.mockResolvedValue('token');
    engine.start();

    const mockFile = { path: 'note.md', name: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# Hello');
    deps.bridge.createDocument.mockResolvedValue({ documentId: 'doc1', url: '' });

    // @ts-ignore - accessing private method for testing
    engine.onFileChange(mockFile);
    // @ts-ignore - accessing private method for testing
    engine.onFileChange(mockFile);

    expect(deps.bridge.createDocument).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);

    expect(deps.bridge.createDocument).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

Run: `npx vitest run src/sync/sync-engine.test.ts`
Expected: FAIL — constructor signature mismatch

- [ ] **Step 4.2: Update SyncEngine constructor and add caching**

```typescript
// In src/sync/sync-engine.ts, replace constructor and add cache fields + getResolvedFolderToken:

export class SyncEngine {
  private running = false;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private cachedFolderToken: string | null = null;
  private cachedFolderPath: string | null = null;

  constructor(
    private plugin: Plugin,
    private bridge: FeishuCliBridge,
    private tracker: SyncStatusTracker,
    private resolver: ConflictResolver,
    private preprocessor: Preprocessor,
    private getFolderPath: () => string,
    private resolveFolderToken: (path: string) => Promise<string>,
  ) {}

  // ... start(), stop(), isRunning() unchanged ...

  private async getResolvedFolderToken(): Promise<string> {
    const currentPath = this.getFolderPath();
    if (!currentPath) return '';

    if (this.cachedFolderToken !== null && this.cachedFolderPath === currentPath) {
      return this.cachedFolderToken;
    }

    const token = await this.resolveFolderToken(currentPath);
    this.cachedFolderToken = token;
    this.cachedFolderPath = currentPath;
    return token;
  }

  async syncFile(file: TFile): Promise<void> {
    if (file.extension !== 'md') return;

    const folderPath = this.getFolderPath();
    if (!folderPath) {
      console.warn('Feishu Sync: folder path not set, skipping', file.path);
      return;
    }

    const folderToken = await this.getResolvedFolderToken();
    if (!folderToken) return;

    const state = this.tracker.getFileState(file.path);
    const decision = this.resolver.resolve(file.stat.mtime, state);
    if (decision === 'skip') return;

    const content = await this.plugin.app.vault.read(file);
    const { content: processedContent } = this.preprocessor.process(content);

    if (!state || !state.feishuDocToken) {
      const title = file.name.replace(/\.md$/, '');
      const fullContent = `# ${title}\n\n${processedContent}`;
      const result = await this.bridge.createDocument(title, fullContent, folderToken);
      this.tracker.updateFileState(file.path, result.documentId, file.stat.mtime);
    } else {
      const fullContent = `# ${file.name.replace(/\.md$/, '')}\n\n${processedContent}`;
      await this.bridge.updateDocument(state.feishuDocToken, fullContent);
      this.tracker.updateFileState(file.path, state.feishuDocToken, file.stat.mtime);
    }
  }

  // syncAll(), onFileChange(), onFileDelete(), onFileRename() unchanged
}
```

- [ ] **Step 4.3: Run sync engine tests**

Run: `npx vitest run src/sync/sync-engine.test.ts`
Expected: PASS (all tests)

- [ ] **Step 4.4: Commit**

```bash
git add src/sync/sync-engine.ts src/sync/sync-engine.test.ts
git commit -m "feat: replace getFolderToken with getFolderPath + resolveFolderToken in SyncEngine"
```

---

### Task 5: Settings tab UI — folder path input

**Files:**
- Modify: `src/ui/settings-tab.ts`

- [ ] **Step 5.1: Update settings tab UI text and field binding**

Replace the "Folder token" setting with "Folder path" in `src/ui/settings-tab.ts`:

```typescript
// In src/ui/settings-tab.ts, replace the Folder token setting block (lines 40-50):

new Setting(containerEl)
  .setName('Folder path')
  .setDesc('Feishu Drive folder path for document sync (e.g., /My Documents/Sync)')
  .addText(text => text
    .setPlaceholder('/My Documents/Sync')
    .setValue((this.plugin.settings?.folderPath || ''))
    .onChange(async value => {
      this.plugin.settings.folderPath = value;
      this.plugin.settings.resolvedFolderToken = '';
      await this.plugin.saveData(this.plugin.settings);
      this.onSettingsChange(this.plugin.settings);
    }));
```

- [ ] **Step 5.2: Verify full test suite compiles and passes**

Run: `npx vitest run`
Expected: PASS (all existing tests, no regressions)

- [ ] **Step 5.3: Add folder path resolution status indicator in settings tab**

```typescript
// In src/ui/settings-tab.ts, add a status element after the folder path input.
// Store a reference to the status element so it can be updated on re-display.

export class SyncSettingsTab extends PluginSettingTab {
  private resolutionStatusEl: HTMLElement | null = null;

  // ... constructor unchanged ...

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Feishu Sync Settings' });

    const folderPathSetting = new Setting(containerEl)
      .setName('Folder path')
      .setDesc('Feishu Drive folder path for document sync (e.g., /My Documents/Sync)')
      .addText(text => text
        .setPlaceholder('/My Documents/Sync')
        .setValue((this.plugin.settings?.folderPath || ''))
        .onChange(async value => {
          this.plugin.settings.folderPath = value;
          this.plugin.settings.resolvedFolderToken = '';
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));

    // Resolution status element
    this.resolutionStatusEl = folderPathSetting.descEl.createSpan({ cls: 'feishu-sync-resolution-status' });
    this.updateResolutionStatus();

    // ... rest of settings unchanged ...
  }

  private updateResolutionStatus(): void {
    if (!this.resolutionStatusEl) return;
    const token = this.plugin.settings?.resolvedFolderToken;
    const path = this.plugin.settings?.folderPath;
    if (!path) {
      this.resolutionStatusEl.setText('');
      return;
    }
    if (token) {
      this.resolutionStatusEl.setText(' ✓ Resolved');
      this.resolutionStatusEl.style.color = 'green';
    } else {
      this.resolutionStatusEl.setText(' ⚠ Not resolved');
      this.resolutionStatusEl.style.color = 'red';
    }
  }
}
```

- [ ] **Step 5.4: Verify full test suite compiles and passes**

Run: `npx vitest run`
Expected: PASS (all existing tests, no regressions)

- [ ] **Step 5.5: Commit**

```bash
git add src/ui/settings-tab.ts
git commit -m "feat: replace folder token input with folder path in settings UI with resolution status"
```

---

### Task 6: main.ts — wiring, migration, and preflight

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 6.1: Update main.ts — legacy migration, SyncEngine construction, preflight**

```typescript
// In src/main.ts, replace the onload() method:

async onload() {
  console.log('Loading Feishu Sync plugin');

  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

  // Legacy migration: copy old folderToken to folderPath
  if ((this.settings as any).folderToken && !this.settings.folderPath) {
    this.settings.folderPath = (this.settings as any).folderToken;
    await this.saveData(this.settings);
  }

  const dataDir = this.manifest.dir || (this.app.vault.configDir + '/plugins/obsidian-feishu-sync');

  this.syncLog = new SyncLog();

  this.bridge = new FeishuCliBridge();
  this.tracker = new SyncStatusTracker(dataDir);
  const resolver = new ConflictResolver();
  const preprocessor = new Preprocessor(this.settings.processorConfig);

  const resolveFolderToken = (path: string) => this.bridge.resolveFolderToken(path);

  this.engine = new SyncEngine(
    this,
    this.bridge,
    this.tracker,
    resolver,
    preprocessor,
    () => this.settings.folderPath,
    resolveFolderToken,
  );

  // Preflight (now includes folder path resolution)
  const preflightResult = await this.bridge.preflight();
  if (!preflightResult.success) {
    new Notice(`Feishu Sync: ${preflightResult.error}`, 5000);
  } else if (this.settings.folderPath) {
    // Resolve folder path during preflight and cache result
    try {
      const resolvedToken = await this.bridge.resolveFolderToken(this.settings.folderPath);
      this.settings.resolvedFolderToken = resolvedToken;
      await this.saveData(this.settings);
    } catch (err) {
      new Notice(
        `Feishu Sync: Failed to resolve folder path "${this.settings.folderPath}": ${(err as Error).message}`,
        5000,
      );
    }
  }

  // Settings tab
  this.addSettingTab(new SyncSettingsTab(this.app, this, (settings) => {
    this.settings = settings;
  }));

  // Status bar
  const statusBarItem = this.addStatusBarItem();
  this.statusBar = new SyncStatusBar(statusBarItem);
  this.statusBar.onClick(() => {
    const entries = this.syncLog.getAll();
    if (entries.length === 0) {
      new Notice('No sync events recorded');
    } else {
      new Notice(`Last sync: ${entries[0].filePath} — ${entries[0].status}`, 3000);
    }
  });

  // Commands
  this.addCommand({
    id: 'sync-current-note',
    name: 'Sync current note to Feishu',
    checkCallback: (checking: boolean) => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== 'md') return false;
      if (!checking) {
        this.engine.syncFile(file).then(() => {
          new Notice(`Synced ${file.name} to Feishu`);
          this.syncLog.add({ timestamp: Date.now(), filePath: file.path, operation: 'update', status: 'success' });
        }).catch(err => {
          new Notice(`Failed to sync ${file.name}: ${err.message}`, 5000);
          this.syncLog.add({ timestamp: Date.now(), filePath: file.path, operation: 'error', status: 'failure', errorMessage: err.message });
        });
      }
      return true;
    },
  });

  this.addCommand({
    id: 'sync-all-notes',
    name: 'Sync all notes to Feishu',
    callback: async () => {
      this.statusBar.updateDisplay('syncing');
      new Notice('Syncing all notes...');
      try {
        await this.engine.syncAll();
        this.statusBar.updateDisplay('ready');
        new Notice('Sync complete');
      } catch (err) {
        this.statusBar.updateDisplay('error', 'Sync failed');
        new Notice(`Sync failed: ${(err as Error).message}`, 5000);
      }
    },
  });

  // Auto-start engine for event-driven sync
  if (this.settings.syncOnSave) {
    this.engine.start();
  }
}
```

- [ ] **Step 6.2: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6.3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire folderPath through main.ts with legacy migration and preflight resolution"
```

---

### Task 7: Integration verification

- [ ] **Step 7.1: Run full test suite and verify zero failures**

Run: `npx vitest run`
Expected: PASS (all tests)

- [ ] **Step 7.2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 7.3: Commit final state if any last fixes were needed**

```bash
git add -A
git commit -m "chore: final integration fixes for folder-path-instead-of-token"
```
