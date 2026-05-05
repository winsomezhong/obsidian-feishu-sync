import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PullService } from '../../src/sync/pull-service';
import { ConflictResolver } from '../../src/sync/conflict-resolver';
import { OnlineDocConverter } from '../../src/sync/online-doc-converter';
import type { RemoteFile, SyncDirection } from '../../src/types';

function createMockPlugin() {
  const vault = {
    adapter: { getBasePath: vi.fn().mockReturnValue('/mock/vault') },
    read: vi.fn().mockResolvedValue('# Existing local content'),
    create: vi.fn().mockResolvedValue(null),
    createFolder: vi.fn().mockResolvedValue(null),
    modify: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(null),
    getAbstractFileByPath: vi.fn().mockReturnValue(null),
  };
  return { app: { vault } };
}

function createMinimalBridge() {
  return {
    listRemoteFiles: vi.fn().mockResolvedValue([]),
    listAllFilesRecursive: vi.fn().mockResolvedValue([]),
    downloadFile: vi.fn().mockResolvedValue(undefined),
    exportDoc: vi.fn().mockResolvedValue('# Exported content'),
    uploadFile: vi.fn().mockResolvedValue({ fileToken: 'newFtok', url: '' }),
  };
}

function createMinimalTracker() {
  return {
    getFileState: vi.fn().mockReturnValue(null),
    updateFileState: vi.fn(),
    removeFileState: vi.fn(),
    getAllFiles: vi.fn().mockReturnValue([]),
  };
}

describe('PullService cross-module integration', () => {
  let mockPlugin: ReturnType<typeof createMockPlugin>;
  let mockBridge: ReturnType<typeof createMinimalBridge>;
  let mockTracker: ReturnType<typeof createMinimalTracker>;
  let converter: OnlineDocConverter;
  let service: PullService;
  const folderToken = 'rootFld';
  const settings = {
    pullEnabled: true,
    pullIntervalMinutes: 10,
    discoverNewFiles: true,
    syncDeletesToLocal: false,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllTimers();
    mockPlugin = createMockPlugin();
    mockBridge = createMinimalBridge();
    mockTracker = createMinimalTracker();
    converter = new OnlineDocConverter(mockBridge as any);
    service = new PullService(
      mockPlugin as any,
      mockBridge as any,
      mockTracker as any,
      new ConflictResolver(),
      converter,
      () => settings,
      () => folderToken,
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // S8: Pull regular .md file
  it('pulls a regular .md file via downloadFile when decision is pull (S8)', async () => {
    mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue([
      { token: 'ftok1', name: 'remote-note.md', type: 'file', modifiedAt: '2026-05-04T12:00:00Z' },
    ]);
    mockTracker.getFileState = vi.fn().mockReturnValue(null);
    settings.discoverNewFiles = true;

    const result = await service.pullAll();

    expect(mockBridge.downloadFile).toHaveBeenCalledWith('ftok1', expect.stringContaining('remote-note.md'), expect.any(String));
    expect(mockTracker.updateFileState).toHaveBeenCalled();
    expect(result.successCount).toBe(1);
    expect(result.pulls).toHaveLength(1);
  });

  // S9: Online docx -> local .md with frontmatter
  it('converts online docx to .md with frontmatter via converter (S9)', async () => {
    mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue([
      { token: 'docToken', name: 'my-doc', type: 'docx', modifiedAt: '2026-05-04T12:00:00Z' },
    ]);

    const result = await service.pullAll();

    expect(mockBridge.exportDoc).toHaveBeenCalledWith('docToken', 'docx');
    expect(mockPlugin.app.vault.create).toHaveBeenCalledWith(
      'my-doc.md',
      expect.stringContaining('feishu_doc_token: "docToken"'),
    );
    expect(result.successCount).toBe(1);
  });

  // S10: Conflict generates .conflict.md result
  it('reports conflict in PullBatchResult when both sides changed (S10)', async () => {
    mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue([
      { token: 'ftok1', name: 'note.md', type: 'file', modifiedAt: '2026-05-04T14:00:00Z' },
    ]);
    mockTracker.getFileState = vi.fn().mockReturnValue({
      localPath: 'note.md',
      feishuFileToken: 'ftok1',
      lastSyncedAt: 500,
      lastLocalMtime: 500,
      isOnlineDoc: false,
    });

    const mockConflictResolver = { resolveBidirectional: vi.fn().mockReturnValue('conflict' as SyncDirection) };
    service = new PullService(
      mockPlugin as any,
      mockBridge as any,
      mockTracker as any,
      mockConflictResolver as any,
      converter,
      () => settings,
      () => folderToken,
    );

    const result = await service.pullAll();
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].path).toContain('.conflict.md');
    expect(result.pulls).toHaveLength(1);
  });

  // S11: Online doc local-only changes not pushed
  it('skips push for online doc local-only changes (S11)', async () => {
    mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue([
      { token: 'docToken', name: 'my-doc', type: 'docx', modifiedAt: '2026-05-04T10:00:00Z' },
    ]);
    mockTracker.getFileState = vi.fn().mockReturnValue({
      localPath: 'docToken.md',
      feishuFileToken: 'docToken',
      lastSyncedAt: 2000,
      lastLocalMtime: 1000,
      isOnlineDoc: true,
      docType: 'docx',
    });

    const result = await service.pullAll();
    expect(result.pushes).toHaveLength(0);
  });

  // S12: syncDeletesToLocal=false preserves local files
  it('does not delete local files when syncDeletesToLocal is false (S12)', async () => {
    mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue([]);
    mockTracker.getAllFiles = vi.fn().mockReturnValue([
      {
        localPath: 'orphan.md',
        feishuFileToken: 'deletedFtok',
        lastSyncedAt: 2000,
        lastLocalMtime: 2000,
      },
    ]);

    const result = await service.pullAll();
    expect(mockPlugin.app.vault.delete).not.toHaveBeenCalled();
    expect(mockTracker.removeFileState).not.toHaveBeenCalled();
    expect(result.successCount).toBe(0);
  });

  // S13: Single file pull by token
  it('pullFile pulls a single file by token (S13)', async () => {
    mockBridge.listAllFilesRecursive = vi.fn().mockResolvedValue([
      { token: 'ftok1', name: 'single-pull.md', type: 'file', modifiedAt: '2026-05-04T12:00:00Z' },
    ]);
    mockTracker.getFileState = vi.fn().mockReturnValue(null);
    settings.discoverNewFiles = true;

    const result = await service.pullFile('ftok1');
    expect(result.success).toBe(true);
    expect(mockBridge.downloadFile).toHaveBeenCalled();
  });
});
