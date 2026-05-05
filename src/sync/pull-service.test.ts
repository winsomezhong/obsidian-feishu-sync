import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TFile } from 'obsidian';
import { PullService } from './pull-service';
import type { FeishuCliBridge } from '../bridge/feishu-cli-bridge';
import type { SyncStatusTracker, FileSyncState } from './sync-status-tracker';
import type { ConflictResolver } from './conflict-resolver';
import type { OnlineDocConverter } from './online-doc-converter';
import type { RemoteFile, SyncDirection } from '../types';

function createMockPlugin() {
  const vault = {
    adapter: {
      getBasePath: vi.fn().mockReturnValue('/mock/vault'),
    },
    read: vi.fn().mockResolvedValue('# Existing content'),
    create: vi.fn().mockResolvedValue(null),
    createFolder: vi.fn().mockResolvedValue(null),
    modify: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(null),
    getAbstractFileByPath: vi.fn().mockReturnValue(null),
  };
  return {
    app: { vault },
  };
}

function createMockBridge(remoteFiles?: RemoteFile[]) {
  const defaultFiles: RemoteFile[] = [
    { token: 'ftok1', name: 'note.md', type: 'file', modifiedAt: '2026-05-04T12:00:00Z' },
    { token: 'ftok2', name: 'doc', type: 'docx', modifiedAt: '2026-05-04T13:00:00Z' },
    { token: 'ftok3', name: 'sheet', type: 'sheet', modifiedAt: '2026-05-04T14:00:00Z' },
    { token: 'ftok4', name: 'image.png', type: 'file', modifiedAt: '2026-05-04T15:00:00Z' },
  ];
  return {
    listRemoteFiles: vi.fn().mockResolvedValue(defaultFiles),
    listAllFilesRecursive: vi.fn().mockResolvedValue(remoteFiles || defaultFiles),
    downloadFile: vi.fn().mockResolvedValue(undefined),
    exportDoc: vi.fn().mockResolvedValue('# Exported content'),
    uploadFile: vi.fn().mockResolvedValue({ fileToken: 'newFtok', url: '' }),
  };
}

function createMockTracker() {
  return {
    getFileState: vi.fn().mockReturnValue(null),
    updateFileState: vi.fn(),
    removeFileState: vi.fn(),
    getAllFiles: vi.fn().mockReturnValue([]),
  };
}

function createMockResolver() {
  return {
    resolveBidirectional: vi.fn().mockReturnValue('pull' as SyncDirection),
  };
}

function createMockConverter() {
  return {
    convert: vi.fn().mockResolvedValue({
      content: '# Exported content',
      frontmatter: '---\nfeishu_doc_token: "ftok2"\n---\n\n',
    }),
    buildFrontmatter: vi.fn().mockReturnValue('---\nfeishu_doc_token: "ftok2"\n---\n\n'),
  };
}

describe('PullService', () => {
  let service: PullService;
  let mockPlugin: ReturnType<typeof createMockPlugin>;
  let mockBridge: ReturnType<typeof createMockBridge>;
  let mockTracker: ReturnType<typeof createMockTracker>;
  let mockResolver: ReturnType<typeof createMockResolver>;
  let mockConverter: ReturnType<typeof createMockConverter>;
  const folderToken = 'rootFld';
  const settings = {
    folderPath: '',
    resolvedFolderToken: '',
    folderResolutionError: '',
    syncOnSave: false,
    language: 'en' as const,
    pullEnabled: true,
    pullIntervalMinutes: 10,
    discoverNewFiles: true,
    syncDeletesToLocal: false,
  };

  function createService() {
    return new PullService(
      mockPlugin as any,
      mockBridge as any,
      mockTracker as any,
      mockResolver as any,
      mockConverter as any,
      () => settings,
      () => folderToken,
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllTimers();
    settings.pullEnabled = true;
    settings.discoverNewFiles = true;
    settings.syncDeletesToLocal = false;
    settings.pullIntervalMinutes = 10;
    mockPlugin = createMockPlugin();
    mockBridge = createMockBridge();
    mockTracker = createMockTracker();
    mockResolver = createMockResolver();
    mockConverter = createMockConverter();
    service = createService();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('start/stop', () => {
    it('registers interval on start when pullEnabled is true', () => {
      service.start();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    it('does not register interval when pullEnabled is false', () => {
      settings.pullEnabled = false;
      service.start();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('clears interval on stop', () => {
      service.start();
      service.stop();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('calls pullAll on each interval tick', async () => {
      const spy = vi.spyOn(service, 'pullAll').mockResolvedValue({
        successCount: 0, failCount: 0, errors: [], conflicts: [], pulls: [], pushes: [],
      });
      service.start();
      await vi.advanceTimersByTimeAsync(600000);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('is idempotent on repeated start calls', () => {
      service.start();
      service.start();
      service.start();
      expect(vi.getTimerCount()).toBe(1);
    });
  });

  describe('pullAll', () => {
    it('calls listAllFilesRecursive with folder token', async () => {
      await service.pullAll();
      expect(mockBridge.listAllFilesRecursive).toHaveBeenCalledWith(folderToken);
    });

    it('processes online docs via converter', async () => {
      mockTracker.getFileState = vi.fn().mockReturnValue({
        localPath: 'doc.md', feishuFileToken: 'ftok2',
        lastSyncedAt: 1000, lastLocalMtime: 1000, isOnlineDoc: true, docType: 'docx',
      });
      await service.pullAll();
      expect(mockConverter.convert).toHaveBeenCalledWith('ftok2', 'docx', '2026-05-04T13:00:00Z');
    });

    it('processes regular .md files via downloadFile', async () => {
      mockTracker.getFileState = vi.fn().mockReturnValue({
        localPath: 'note.md', feishuFileToken: 'ftok1',
        lastSyncedAt: 1000, lastLocalMtime: 1000, isOnlineDoc: false,
      });
      await service.pullAll();
      expect(mockBridge.downloadFile).toHaveBeenCalled();
    });

    it('skips non-md files', async () => {
      const result = await service.pullAll();
      // image.png and folder should be skipped
      expect(mockBridge.downloadFile).not.toHaveBeenCalledWith('ftok4', expect.any(String));
    });

    it('skips folders', async () => {
      await service.pullAll();
      expect(mockBridge.downloadFile).not.toHaveBeenCalledWith('ftok5', expect.any(String));
    });

    it('creates conflict.md when resolveBidirectional returns conflict', async () => {
      const stateMap: Record<string, any> = {
        'note.md': {
          localPath: 'note.md', feishuFileToken: 'ftok1',
          lastSyncedAt: 500, lastLocalMtime: 500, isOnlineDoc: false,
        },
      };
      mockTracker.getFileState = vi.fn((path: string) => stateMap[path] || null);
      mockResolver.resolveBidirectional = vi.fn((_lm: number, _rm: number | string, state: any) => {
        return state ? 'conflict' as SyncDirection : 'pull' as SyncDirection;
      });
      const tfile = { path: 'note.md' };
      Object.setPrototypeOf(tfile, TFile.prototype);
      mockPlugin.app.vault.getAbstractFileByPath = vi.fn((path: string) => {
        return path === 'note.md' ? tfile : null;
      });
      await service.pullAll();
      expect(mockPlugin.app.vault.read).toHaveBeenCalled();
      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('.conflict.md'),
        '# Existing content',
      );
    });

    it('handles errors gracefully and continues', async () => {
      mockBridge.listAllFilesRecursive = vi.fn().mockRejectedValue(new Error('List failed'));
      const result = await service.pullAll();
      expect(result.failCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('returns PullBatchResult with counts', async () => {
      const result = await service.pullAll();
      expect(result).toHaveProperty('successCount');
      expect(result).toHaveProperty('failCount');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('pulls');
      expect(result).toHaveProperty('pushes');
    });

    it('discovers new remote files when discoverNewFiles is true', async () => {
      settings.discoverNewFiles = true;
      mockTracker.getFileState = vi.fn().mockReturnValue(null);
      await service.pullAll();
      // Should pull new files via converter for online docs
      expect(mockConverter.convert).toHaveBeenCalled();
    });

    it('skips new remote files when discoverNewFiles is false', async () => {
      settings.discoverNewFiles = false;
      mockTracker.getFileState = vi.fn().mockReturnValue(null);
      await service.pullAll();
      expect(mockConverter.convert).not.toHaveBeenCalled();
      expect(mockBridge.downloadFile).not.toHaveBeenCalled();
    });

    it('writes online doc from subfolder as {path}/{name}.md', async () => {
      const subFiles: RemoteFile[] = [
        { token: 'docx_sub', name: 'testonlinedoc', type: 'docx', modifiedAt: '2026-05-04T12:00:00Z', path: '_e2etest' },
      ];
      mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue(subFiles);
      mockTracker.getFileState = vi.fn().mockReturnValue(null);
      await service.pullAll();
      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith(
        '_e2etest/testonlinedoc.md',
        expect.any(String),
      );
    });

    it('writes regular .md file from subfolder with path prefix', async () => {
      const subFiles: RemoteFile[] = [
        { token: 'ftok_sub', name: 'nested.md', type: 'file', modifiedAt: '2026-05-04T12:00:00Z', path: 'deep/folder' },
      ];
      mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue(subFiles);
      mockTracker.getFileState = vi.fn().mockReturnValue({
        localPath: 'deep/folder/nested.md', feishuFileToken: 'ftok_sub',
        lastSyncedAt: 1000, lastLocalMtime: 1000, isOnlineDoc: false,
      });
      await service.pullAll();
      expect(mockBridge.downloadFile).toHaveBeenCalledWith(
        'ftok_sub',
        'deep/folder/nested.md',
        '/mock/vault',
      );
    });

    it('skips discoverNewFiles=false even for subfolder files', async () => {
      settings.discoverNewFiles = false;
      const subFiles: RemoteFile[] = [
        { token: 'docx_new', name: 'newdoc', type: 'docx', modifiedAt: '2026-05-04T12:00:00Z', path: '_e2etest' },
      ];
      mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue(subFiles);
      mockTracker.getFileState = vi.fn().mockReturnValue(null);
      await service.pullAll();
      expect(mockConverter.convert).not.toHaveBeenCalled();
    });

    it('writes pulled file content to vault on conflict', async () => {
      mockTracker.getFileState = vi.fn().mockReturnValue({
        localPath: 'note.md', feishuFileToken: 'ftok1',
        lastSyncedAt: 500, lastLocalMtime: 500, isOnlineDoc: false,
      });
      mockResolver.resolveBidirectional = vi.fn().mockReturnValue('pull' as SyncDirection);
      await service.pullAll();
      // For regular file pull, downloadFile is used (not vault.modify)
      expect(mockBridge.downloadFile).toHaveBeenCalled();
    });
  });

  describe('pullFile', () => {
    it('pulls a single file by token', async () => {
      const result = await service.pullFile('ftok1');
      expect(result).toHaveProperty('success');
    });

    it('returns not-found when token not in remote list', async () => {
      mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue([] as RemoteFile[]);
      const result = await service.pullFile('nonexistent');
      expect(result.success).toBe(false);
    });
  });
});
