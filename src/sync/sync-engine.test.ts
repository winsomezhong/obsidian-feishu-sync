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

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createMockPlugin();
    deps = createMockDeps();
    engine = new SyncEngine(plugin, deps.bridge, deps.tracker, deps.resolver, deps.preprocessor, () => 'test-token');
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
    const mockFile = { path: 'note.md', name: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# Hello');
    deps.bridge.createDocument.mockResolvedValue({ documentId: 'doc1', url: 'https://feishu.cn/doc/doc1' });

    await engine.syncFile(mockFile);

    expect(deps.bridge.createDocument).toHaveBeenCalledWith('note', '# note\n\nprocessed', 'test-token');
    expect(deps.tracker.updateFileState).toHaveBeenCalledWith('note.md', 'doc1', 1000);
  });

  it('syncFile updates existing doc when state exists', async () => {
    const mockFile = { path: 'note.md', name: 'note.md', extension: 'md', stat: { mtime: 2000 } } as any;
    deps.tracker.getFileState.mockReturnValue({ feishuDocToken: 'doc1' } as any);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# Updated');

    await engine.syncFile(mockFile);

    expect(deps.bridge.updateDocument).toHaveBeenCalledWith('doc1', expect.any(String));
    expect(deps.tracker.updateFileState).toHaveBeenCalledWith('note.md', 'doc1', 2000);
  });

  it('syncFile skips file when resolver returns skip', async () => {
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

  it('syncAll iterates all markdown files', async () => {
    const files = [{ path: 'a.md', extension: 'md' }, { path: 'b.md', extension: 'md' }] as any[];
    mockGetMarkdownFiles.mockReturnValue(files);
    vi.spyOn(engine, 'syncFile').mockResolvedValue();

    await engine.syncAll();

    expect(engine.syncFile).toHaveBeenCalledTimes(2);
  });

  it('syncAll collects errors without throwing', async () => {
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
    engine.start();

    const mockFile = { path: 'note.md', name: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# Hello');
    deps.bridge.createDocument.mockResolvedValue({ documentId: 'doc1', url: '' });

    // Trigger the file change handler manually
    // @ts-ignore - accessing private method for testing
    engine.onFileChange(mockFile);
    // @ts-ignore - accessing private method for testing
    engine.onFileChange(mockFile);

    // Only one timer should exist for this path
    expect(deps.bridge.createDocument).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);

    expect(deps.bridge.createDocument).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
