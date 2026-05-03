import { describe, it, expect, vi, beforeEach } from 'vitest';

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
