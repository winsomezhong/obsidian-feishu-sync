import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => ({
  Plugin: class MockPlugin {},
  TFile: class MockTFile {},
}));

const mockVaultOn = vi.fn();
const mockVaultRead = vi.fn();
const mockGetMarkdownFiles = vi.fn();
const mockRegisterEvent = vi.fn();
const mockAdapterGetBasePath = vi.fn();

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
          getBasePath: mockAdapterGetBasePath,
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
      findSubfolder: vi.fn(),
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

  it('stop() clears running state and folder cache', () => {
    engine.start();
    engine.stop();
    expect(engine.isRunning()).toBe(false);
  });

  it('isRunning() returns false initially', () => {
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
      mockAdapterGetBasePath.mockReturnValue('/my/vault');
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');
      deps.bridge.uploadFile.mockResolvedValue({ fileToken: 'ftok1', url: '' });

      await engine.syncFile(mockFile);

      expect(deps.bridge.createFolder).toHaveBeenCalledWith('root-token', 'notes');
      expect(deps.bridge.uploadFile).toHaveBeenCalledWith('notes/tech.md', 'folderXYZ', 'tech.md', '/my/vault');
      expect(deps.tracker.updateFileState).toHaveBeenCalledWith('notes/tech.md', 'ftok1', 1000);
    });

    it('re-uploads when state exists', async () => {
      const mockFile = {
        path: 'notes/tech.md',
        name: 'tech.md',
        extension: 'md',
        stat: { mtime: 2000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok1' });
      deps.resolver.resolve.mockReturnValue('needs-sync');
      mockAdapterGetBasePath.mockReturnValue('/my/vault');
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');
      deps.bridge.uploadFile.mockResolvedValue({ fileToken: 'ftok2', url: '' });

      await engine.syncFile(mockFile);

      expect(deps.bridge.uploadFile).toHaveBeenCalledWith('notes/tech.md', 'folderXYZ', 'tech.md', '/my/vault');
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
      expect(deps.bridge.findSubfolder).not.toHaveBeenCalled();
      expect(deps.bridge.createFolder).not.toHaveBeenCalled();
    });

    it('reuses existing folder when found', async () => {
      deps.bridge.findSubfolder.mockResolvedValue('fld_notes');
      const result = await engine.ensureFolderPath('notes/todo.md');
      expect(result).toBe('fld_notes');
      expect(deps.bridge.findSubfolder).toHaveBeenCalledWith('root-token', 'notes');
      expect(deps.bridge.createFolder).not.toHaveBeenCalled();
    });

    it('creates folder when not found', async () => {
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('fld_new');
      const result = await engine.ensureFolderPath('notes/todo.md');
      expect(result).toBe('fld_new');
      expect(deps.bridge.findSubfolder).toHaveBeenCalledWith('root-token', 'notes');
      expect(deps.bridge.createFolder).toHaveBeenCalledWith('root-token', 'notes');
    });

    it('uses cache for second call with same directory', async () => {
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('fld_notes');
      await engine.ensureFolderPath('notes/a.md');
      await engine.ensureFolderPath('notes/b.md');
      expect(deps.bridge.findSubfolder).toHaveBeenCalledTimes(1);
      expect(deps.bridge.createFolder).toHaveBeenCalledTimes(1);
    });

    it('reuses nested existing folders', async () => {
      deps.bridge.findSubfolder
        .mockResolvedValueOnce('fld_projects')
        .mockResolvedValueOnce('fld_client');
      const result = await engine.ensureFolderPath('projects/client/spec.md');
      expect(result).toBe('fld_client');
      expect(deps.bridge.createFolder).not.toHaveBeenCalled();
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

  describe('syncAll', () => {
    it('iterates all markdown files', async () => {
      const files = [{ path: 'a.md', extension: 'md' }, { path: 'b.md', extension: 'md' }] as any[];
      mockGetMarkdownFiles.mockReturnValue(files);
      vi.spyOn(engine, 'syncFile').mockResolvedValue();

      await engine.syncAll();

      expect(engine.syncFile).toHaveBeenCalledTimes(2);
    });
  });
});
