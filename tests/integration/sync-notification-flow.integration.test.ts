import { describe, it, expect, vi, beforeEach } from "vitest";

const mockNotice = vi.hoisted(() => vi.fn());
vi.mock("obsidian", () => ({
  Notice: mockNotice,
  Plugin: class MockPlugin {},
  TFile: class MockTFile {},
}));

import { SyncEngine, SyncNotifier } from "../../src/sync";
import type { SyncBatchResult } from "../../src/sync/sync-engine";

const mockVaultOn = vi.fn();
const mockGetMarkdownFiles = vi.fn();
const mockAdapterGetBasePath = vi.fn();

function createMockPlugin() {
  return {
    registerEvent: vi.fn(),
    app: {
      vault: {
        on: mockVaultOn,
        getMarkdownFiles: mockGetMarkdownFiles,
        adapter: { getBasePath: mockAdapterGetBasePath },
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

describe("SyncEngine to SyncNotifier integration", () => {
  let engine: any;
  let plugin: any;
  let deps: any;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createMockPlugin();
    deps = createMockDeps();
    engine = new SyncEngine(
      plugin,
      deps.bridge,
      deps.tracker,
      deps.resolver,
      () => "root-folder",
      vi.fn().mockResolvedValue("root-token"),
      undefined,
    );
  });

  it("syncAll result consumed by SyncNotifier.notifyBatch (all succeed)", async () => {
    const files = [
      { path: "a.md", extension: "md", stat: { mtime: 100 } },
      { path: "b.md", extension: "md", stat: { mtime: 200 } },
    ] as any[];
    mockGetMarkdownFiles.mockReturnValue(files);
    mockAdapterGetBasePath.mockReturnValue("/vault");
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue("needs-sync");
    deps.bridge.findSubfolder.mockResolvedValue(null);
    deps.bridge.createFolder.mockResolvedValue("fld");
    deps.bridge.uploadFile
      .mockResolvedValueOnce({ fileToken: "ftok_a", url: "" })
      .mockResolvedValueOnce({ fileToken: "ftok_b", url: "" });
    const result: SyncBatchResult = await engine.syncAll();
    expect(result.successCount).toBe(2);
    expect(result.failCount).toBe(0);
    expect(result.errors).toHaveLength(0);
    SyncNotifier.notifyBatch(result.successCount, result.failCount);
    expect(mockNotice).toHaveBeenCalledWith("Synced 2 file(s) to Feishu", 8000);
  });

  it("syncAll result consumed by SyncNotifier (partial success)", async () => {
    const files = [
      { path: "ok.md", extension: "md", stat: { mtime: 100 } },
      { path: "fail.md", extension: "md", stat: { mtime: 200 } },
      { path: "ok2.md", extension: "md", stat: { mtime: 300 } },
    ] as any[];
    mockGetMarkdownFiles.mockReturnValue(files);
    mockAdapterGetBasePath.mockReturnValue("/vault");
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue("needs-sync");
    deps.bridge.findSubfolder.mockResolvedValue(null);
    deps.bridge.createFolder.mockResolvedValue("fld");
    deps.bridge.uploadFile
      .mockResolvedValueOnce({ fileToken: "ftok_ok", url: "" })
      .mockRejectedValueOnce(new Error("Upload quota exceeded"))
      .mockResolvedValueOnce({ fileToken: "ftok_ok2", url: "" });
    const result: SyncBatchResult = await engine.syncAll();
    expect(result.successCount).toBe(2);
    expect(result.failCount).toBe(1);
    expect(result.errors[0].path).toBe("fail.md");
    SyncNotifier.notifyBatch(result.successCount, result.failCount, result.errors);
    expect(mockNotice).toHaveBeenCalledWith("Synced 2 file(s), 1 failed", 10000);
  });

  it("syncAll result consumed by SyncNotifier (all fail)", async () => {
    const files = [{ path: "bad.md", extension: "md", stat: { mtime: 100 } }] as any[];
    mockGetMarkdownFiles.mockReturnValue(files);
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue("needs-sync");
    deps.bridge.uploadFile.mockRejectedValue(new Error("Auth token expired"));
    const result: SyncBatchResult = await engine.syncAll();
    SyncNotifier.notifyBatch(result.successCount, result.failCount, result.errors);
    expect(mockNotice).toHaveBeenCalledWith("Sync failed: Auth token expired", 10000);
  });
  it("auto-sync callback aggregates results", async () => {
    const autoSyncBatch: Array<{ path: string; success: boolean; error?: Error }> = [];
    engine = new SyncEngine(
      plugin, deps.bridge, deps.tracker, deps.resolver,
      () => "root-folder", vi.fn().mockResolvedValue("root-token"),
      (r: any) => autoSyncBatch.push(r),
    );
    const fileA = { path: "doc/a.md", name: "a.md", extension: "md", stat: { mtime: 100 } } as any;
    const fileB = { path: "doc/b.md", name: "b.md", extension: "md", stat: { mtime: 200 } } as any;
    engine.start();

    const modifyHandler = mockVaultOn.mock.calls.find((c: any[]) => c[0] === "modify")[1];
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue("needs-sync");
    mockAdapterGetBasePath.mockReturnValue("/vault");
    deps.bridge.findSubfolder.mockResolvedValue(null);
    deps.bridge.createFolder.mockResolvedValue("fld");
    deps.bridge.uploadFile
      .mockResolvedValueOnce({ fileToken: "ftok_a", url: "" })
      .mockResolvedValueOnce({ fileToken: "ftok_b", url: "" });
    await modifyHandler(fileA);
    await modifyHandler(fileB);
    await new Promise(r => setTimeout(r, 2100));
    expect(autoSyncBatch).toHaveLength(2);
    const sc = autoSyncBatch.filter(r => r.success).length;
    SyncNotifier.notifyBatch(sc, autoSyncBatch.length - sc);
    expect(mockNotice).toHaveBeenCalledWith("Synced 2 file(s) to Feishu", 8000);
  });

  it("auto-sync callback with mixed success/failure", async () => {
    const autoSyncBatch: Array<{ path: string; success: boolean; error?: Error }> = [];
    engine = new SyncEngine(
      plugin, deps.bridge, deps.tracker, deps.resolver,
      () => "root-folder", vi.fn().mockResolvedValue("root-token"),
      (r: any) => autoSyncBatch.push(r),
    );
    const fileA = { path: "good.md", extension: "md", stat: { mtime: 100 } } as any;
    const fileB = { path: "bad.md", extension: "md", stat: { mtime: 200 } } as any;
    engine.start();
    const modifyHandler = mockVaultOn.mock.calls.find((c: any[]) => c[0] === "modify")[1];
    deps.tracker.getFileState.mockReturnValue(null);
    deps.resolver.resolve.mockReturnValue("needs-sync");
    mockAdapterGetBasePath.mockReturnValue("/vault");
    deps.bridge.findSubfolder.mockResolvedValue(null);
    deps.bridge.createFolder.mockResolvedValue("fld");
    deps.bridge.uploadFile
      .mockResolvedValueOnce({ fileToken: "ftok_good", url: "" })
      .mockRejectedValueOnce(new Error("Permission denied"));
    await modifyHandler(fileA);
    await modifyHandler(fileB);
    await new Promise(r => setTimeout(r, 2100));
    expect(autoSyncBatch).toHaveLength(2);
    const sc = autoSyncBatch.filter(r => r.success).length;
    const fc = autoSyncBatch.filter(r => !r.success).length;
    const errors = autoSyncBatch.filter(r => !r.success).map(r => ({ path: r.path, error: r.error! }));
    expect(sc).toBe(1);
    expect(fc).toBe(1);
    SyncNotifier.notifyBatch(sc, fc, errors);
    expect(mockNotice).toHaveBeenCalledWith("Synced 1 file(s), 1 failed", 10000);
  });

  it("onFileDelete triggers auto-sync callback", async () => {
    const cbResults: Array<{ path: string; success: boolean; error?: Error }> = [];
    engine = new SyncEngine(
      plugin, deps.bridge, deps.tracker, deps.resolver,
      () => "root-folder", vi.fn().mockResolvedValue("root-token"),
      (r: any) => cbResults.push(r),
    );
    const file = { path: "gone.md", extension: "md" } as any;
    deps.tracker.getFileState.mockReturnValue({ feishuFileToken: "ftok_gone" });
    deps.bridge.deleteFile.mockResolvedValue(undefined);
    await (engine as any).onFileDelete(file);
    expect(cbResults).toHaveLength(1);
    expect(cbResults[0].success).toBe(true);
  });

  it("onFileRename triggers auto-sync callback", async () => {
    const cbResults: Array<{ path: string; success: boolean; error?: Error }> = [];
    engine = new SyncEngine(
      plugin, deps.bridge, deps.tracker, deps.resolver,
      () => "root-folder", vi.fn().mockResolvedValue("root-token"),
      (r: any) => cbResults.push(r),
    );
    const file = { path: "archive/moved.md", extension: "md", stat: { mtime: 300 } } as any;
    deps.tracker.getFileState.mockReturnValue({ feishuFileToken: "ftok_move" });
    deps.bridge.findSubfolder.mockResolvedValue("fld_dest");
    deps.bridge.moveFile.mockResolvedValue(undefined);
    await (engine as any).onFileRename(file, "inbox/moved.md");
    expect(cbResults).toHaveLength(1);
    expect(cbResults[0].success).toBe(true);
  });
});
