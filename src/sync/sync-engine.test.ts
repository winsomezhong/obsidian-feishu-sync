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

function createEngine(plugin: any, deps: ReturnType<typeof createMockDeps>, resolveToken?: any) {
  return new SyncEngine(
    plugin,
    deps.bridge,
    deps.tracker,
    deps.resolver,
    () => 'root-token',
    resolveToken ?? vi.fn().mockResolvedValue('root-token'),
  );
}

describe('SyncEngine', () => {
  let engine: SyncEngine;
  let plugin: any;
  let deps: ReturnType<typeof createMockDeps>;
  let mockResolveToken: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createMockPlugin();
    deps = createMockDeps();
    mockResolveToken = vi.fn().mockResolvedValue('root-token');
    engine = createEngine(plugin, deps, mockResolveToken);
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
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');
      deps.bridge.uploadFile.mockResolvedValue({ fileToken: 'ftok1', url: '' });

      await engine.syncFile(mockFile);

      expect(deps.bridge.createFolder).toHaveBeenCalledWith('root-token', 'notes');
      expect(deps.bridge.uploadFile).toHaveBeenCalledWith('notes/tech.md', 'folderXYZ', 'tech.md', '/my/vault');
      expect(deps.tracker.updateFileState).toHaveBeenCalledWith('notes/tech.md', 'ftok1', 1000);
    });

    it('deletes old file then re-uploads when state exists', async () => {
      const mockFile = {
        path: 'notes/tech.md',
        name: 'tech.md',
        extension: 'md',
        stat: { mtime: 2000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok1' });
      deps.resolver.resolve.mockReturnValue('needs-sync');
      mockAdapterGetBasePath.mockReturnValue('/my/vault');
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');
      deps.bridge.uploadFile.mockResolvedValue({ fileToken: 'ftok2', url: '' });

      await engine.syncFile(mockFile);

      expect(deps.bridge.deleteFile).toHaveBeenCalledWith('ftok1');
      expect(deps.bridge.uploadFile).toHaveBeenCalledWith('notes/tech.md', 'folderXYZ', 'tech.md', '/my/vault');
      expect(deps.tracker.updateFileState).toHaveBeenCalledWith('notes/tech.md', 'ftok2', 2000);
    });

    it('still uploads when deleteFile fails with already-deleted error', async () => {
      const mockFile = {
        path: 'notes/tech.md',
        name: 'tech.md',
        extension: 'md',
        stat: { mtime: 2000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok_gone' });
      deps.resolver.resolve.mockReturnValue('needs-sync');
      mockAdapterGetBasePath.mockReturnValue('/my/vault');
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');
      deps.bridge.deleteFile.mockRejectedValue({ code: '1061007', message: 'file has been delete' });
      deps.bridge.uploadFile.mockResolvedValue({ fileToken: 'ftok_new', url: '' });

      await engine.syncFile(mockFile);

      expect(deps.bridge.deleteFile).toHaveBeenCalledWith('ftok_gone');
      expect(deps.bridge.uploadFile).toHaveBeenCalledWith('notes/tech.md', 'folderXYZ', 'tech.md', '/my/vault');
      expect(deps.tracker.updateFileState).toHaveBeenCalledWith('notes/tech.md', 'ftok_new', 2000);
    });

    it('throws when deleteFile fails with a real error (not already-deleted)', async () => {
      const mockFile = {
        path: 'notes/tech.md',
        name: 'tech.md',
        extension: 'md',
        stat: { mtime: 2000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok1' });
      deps.resolver.resolve.mockReturnValue('needs-sync');
      deps.bridge.deleteFile.mockRejectedValue({ code: 'PERMISSION_DENIED', message: 'permission denied for delete' });

      await expect(engine.syncFile(mockFile)).rejects.toThrow();
      expect(deps.bridge.uploadFile).not.toHaveBeenCalled();
    });

    it('throws when deleteFile fails with error code 1061006', async () => {
      const mockFile = {
        path: 'notes/tech.md',
        name: 'tech.md',
        extension: 'md',
        stat: { mtime: 2000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok1' });
      deps.resolver.resolve.mockReturnValue('needs-sync');
      deps.bridge.deleteFile.mockRejectedValue({ code: '1061006', message: 'some other error' });

      await expect(engine.syncFile(mockFile)).rejects.toThrow();
      expect(deps.bridge.uploadFile).not.toHaveBeenCalled();
    });

    it('handles already-deleted error with code as number', async () => {
      const mockFile = {
        path: 'notes/tech.md',
        name: 'tech.md',
        extension: 'md',
        stat: { mtime: 2000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok_gone' });
      deps.resolver.resolve.mockReturnValue('needs-sync');
      mockAdapterGetBasePath.mockReturnValue('/my/vault');
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');
      deps.bridge.deleteFile.mockRejectedValue({ code: 1061007, message: 'not found' });
      deps.bridge.uploadFile.mockResolvedValue({ fileToken: 'ftok_new', url: '' });

      await engine.syncFile(mockFile);

      expect(deps.bridge.deleteFile).toHaveBeenCalledWith('ftok_gone');
      expect(deps.bridge.uploadFile).toHaveBeenCalled();
      expect(deps.tracker.updateFileState).toHaveBeenCalled();
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

    it('skips when folder path is empty', async () => {
      const engineNoPath = new SyncEngine(
        plugin, deps.bridge, deps.tracker, deps.resolver,
        () => '',
        mockResolveToken,
      );
      const mockFile = { path: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
      await engineNoPath.syncFile(mockFile);
      expect(deps.bridge.uploadFile).not.toHaveBeenCalled();
    });

    it('serializes concurrent syncFile calls for the same file (only one upload)', async () => {
      const mockFile = {
        path: 'notes/dup.md',
        name: 'dup.md',
        extension: 'md',
        stat: { mtime: 1000 },
      } as any;

      const stateMap: Record<string, any> = {};
      deps.tracker.getFileState.mockImplementation((path: string) => stateMap[path] || null);
      deps.tracker.updateFileState.mockImplementation(
        (path: string, token: string, mtime: number) => {
          stateMap[path] = { feishuFileToken: token, lastLocalMtime: mtime };
        },
      );
      deps.resolver.resolve.mockImplementation((mtime: number, state: any) => {
        if (!state) return 'needs-sync';
        if (mtime > state.lastLocalMtime) return 'needs-sync';
        return 'skip';
      });

      mockAdapterGetBasePath.mockReturnValue('/my/vault');
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');

      let resolveUpload: (v: { fileToken: string; url: string }) => void = () => {};
      const uploadPromise = new Promise<{ fileToken: string; url: string }>(r => { resolveUpload = r; });
      deps.bridge.uploadFile.mockReturnValue(uploadPromise);

      const call1 = engine.syncFile(mockFile);
      const call2 = engine.syncFile(mockFile);

      resolveUpload({ fileToken: 'ftok_only', url: '' });
      await Promise.all([call1, call2]);

      expect(deps.bridge.uploadFile).toHaveBeenCalledTimes(1);
      expect(deps.tracker.updateFileState).toHaveBeenCalledTimes(1);
      expect(deps.tracker.updateFileState).toHaveBeenCalledWith('notes/dup.md', 'ftok_only', 1000);
    });

    it('re-syncs if file modified while previous sync was in-flight', async () => {
      const mockFile = {
        path: 'notes/mod.md',
        name: 'mod.md',
        extension: 'md',
        stat: { mtime: 2000 },
      } as any;
      deps.tracker.getFileState.mockReturnValue(null);
      deps.resolver.resolve.mockReturnValue('needs-sync');
      mockAdapterGetBasePath.mockReturnValue('/my/vault');
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('folderXYZ');

      let resolveUpload1: (v: { fileToken: string; url: string }) => void = () => {};
      const uploadPromise1 = new Promise<{ fileToken: string; url: string }>(r => { resolveUpload1 = r; });
      deps.bridge.uploadFile.mockReturnValueOnce(uploadPromise1);

      const call1 = engine.syncFile(mockFile);

      const mockFile2 = { ...mockFile, stat: { mtime: 3000 } };
      deps.resolver.resolve.mockReturnValueOnce('needs-sync');
      deps.tracker.getFileState.mockReturnValueOnce(null);
      deps.bridge.uploadFile.mockReturnValueOnce(
        Promise.resolve({ fileToken: 'ftok_after', url: '' }),
      );
      const call2 = engine.syncFile(mockFile2);

      resolveUpload1({ fileToken: 'ftok_first', url: '' });
      await call1;

      await call2;

      expect(deps.bridge.uploadFile).toHaveBeenCalledTimes(2);
    });

    it('skips when folder token resolution returns empty', async () => {
      const engineNoToken = new SyncEngine(
        plugin, deps.bridge, deps.tracker, deps.resolver,
        () => '/bad/path',
        vi.fn().mockResolvedValue(''),
      );
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

    it('creates folder only once under concurrent calls', async () => {
      // Use a deferred promise so both callers reach findSubfolder before either creates
      let resolveFind: (v: string | null) => void = () => {};
      const findPromise = new Promise<string | null>(r => { resolveFind = r; });

      deps.bridge.findSubfolder.mockReturnValue(findPromise);
      deps.bridge.createFolder.mockResolvedValue('fld_shared');

      const results = Promise.all([
        engine.ensureFolderPath('shared/a.md'),
        engine.ensureFolderPath('shared/b.md'),
      ]);

      // Both callers are now waiting on findSubfolder. Resolve it.
      resolveFind(null);
      const [r1, r2] = await results;

      expect(r1).toBe('fld_shared');
      expect(r2).toBe('fld_shared');
      expect(deps.bridge.createFolder).toHaveBeenCalledTimes(1);
      expect(deps.bridge.createFolder).toHaveBeenCalledWith('root-token', 'shared');
    });
  });

  describe('getResolvedFolderToken caching', () => {
    it('caches resolved token and reuses on second call', async () => {
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('fld_notes');
      deps.tracker.getFileState.mockReturnValue(null);
      deps.resolver.resolve.mockReturnValue('needs-sync');
      mockAdapterGetBasePath.mockReturnValue('/vault');

      await engine.ensureFolderPath('notes/a.md');
      await engine.ensureFolderPath('notes/b.md');

      // resolveFolderToken should only be called once (cached)
      expect(mockResolveToken).toHaveBeenCalledTimes(1);
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

    it('still removes state when delete fails with already-deleted error', async () => {
      const mockFile = { path: 'note.md', extension: 'md' } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok_del' });
      deps.bridge.deleteFile.mockRejectedValue({ code: '1061007', message: 'file already deleted' });
      // @ts-ignore
      await engine.onFileDelete(mockFile);
      expect(deps.bridge.deleteFile).toHaveBeenCalledWith('ftok_del');
      expect(deps.tracker.removeFileState).toHaveBeenCalledWith('note.md');
    });

    it('does not remove state when delete fails with real error', async () => {
      const mockFile = { path: 'note.md', extension: 'md' } as any;
      deps.tracker.getFileState.mockReturnValue({ feishuFileToken: 'ftok_del' });
      deps.bridge.deleteFile.mockRejectedValue({ code: 'NETWORK_ERROR', message: 'network failure' });
      // @ts-ignore
      await engine.onFileDelete(mockFile);
      expect(deps.bridge.deleteFile).toHaveBeenCalledWith('ftok_del');
      expect(deps.tracker.removeFileState).not.toHaveBeenCalled();
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
      deps.bridge.findSubfolder.mockResolvedValue(null);
      deps.bridge.createFolder.mockResolvedValue('fld_archive');

      // @ts-ignore
      await engine.onFileRename(mockFile, 'inbox/note.md');

      expect(deps.tracker.removeFileState).toHaveBeenCalledWith('inbox/note.md');
      expect(deps.bridge.moveFile).toHaveBeenCalledWith('ftok_move', 'fld_archive');
      expect(deps.tracker.updateFileState).toHaveBeenCalledWith('archive/note.md', 'ftok_move', 3000);
    });
  });

  describe('syncAll', () => {
    it('iterates all markdown files and returns success count', async () => {
      const files = [{ path: 'a.md', extension: 'md' }, { path: 'b.md', extension: 'md' }] as any[];
      mockGetMarkdownFiles.mockReturnValue(files);
      vi.spyOn(engine, 'syncFile').mockResolvedValue();

      const result = await engine.syncAll();

      expect(engine.syncFile).toHaveBeenCalledTimes(2);
      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('returns partial success with error details', async () => {
      const files = [
        { path: 'a.md', extension: 'md' },
        { path: 'b.md', extension: 'md' },
        { path: 'c.md', extension: 'md' },
      ] as any[];
      mockGetMarkdownFiles.mockReturnValue(files);
      const syncFileSpy = vi.spyOn(engine, 'syncFile');
      syncFileSpy.mockResolvedValueOnce();
      syncFileSpy.mockRejectedValueOnce(new Error('Network error'));
      syncFileSpy.mockResolvedValueOnce();

      const result = await engine.syncAll();

      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe('b.md');
      expect(result.errors[0].error.message).toBe('Network error');
    });
  });
});
