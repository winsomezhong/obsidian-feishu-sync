import { Plugin, TFile } from 'obsidian';
import { FeishuCliBridge } from '../bridge/feishu-cli-bridge';
import { SyncStatusTracker } from './sync-status-tracker';
import { ConflictResolver } from './conflict-resolver';

export class SyncEngine {
  private running = false;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private folderCache: Map<string, string> = new Map();
  private folderLocks: Map<string, Promise<string>> = new Map();
  private cachedFolderToken: string | null = null;
  private cachedFolderPath: string | null = null;

  constructor(
    private plugin: Plugin,
    private bridge: FeishuCliBridge,
    private tracker: SyncStatusTracker,
    private resolver: ConflictResolver,
    private getFolderPath: () => string,
    private resolveFolderToken: (path: string) => Promise<string>,
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
    this.folderLocks.clear();
    this.cachedFolderToken = null;
    this.cachedFolderPath = null;
  }

  isRunning(): boolean {
    return this.running;
  }

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

  async ensureFolderPath(filePath: string): Promise<string> {
    const rootToken = await this.getResolvedFolderToken();
    const segments = filePath.split('/');
    segments.pop(); // remove filename
    if (segments.length === 0) return rootToken;

    let currentParentToken = rootToken;
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      // Fast path: cached from a previous resolution
      const cached = this.folderCache.get(currentPath);
      if (cached) {
        currentParentToken = cached;
        continue;
      }

      // If a concurrent call is already resolving this path, wait for it
      const inflight = this.folderLocks.get(currentPath);
      if (inflight) {
        currentParentToken = await inflight;
        continue;
      }

      // Resolve (find-or-create) under a per-path lock to prevent duplicates
      const lock = (async (): Promise<string> => {
        const existing = await this.bridge.findSubfolder(currentParentToken, segment);
        return existing || this.bridge.createFolder(currentParentToken, segment);
      })();

      this.folderLocks.set(currentPath, lock);
      currentParentToken = await lock;
      this.folderCache.set(currentPath, currentParentToken);
      this.folderLocks.delete(currentPath);
    }

    return currentParentToken;
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

    if (state?.feishuFileToken) {
      try {
        await this.bridge.deleteFile(state.feishuFileToken);
      } catch (err: any) {
        if (err?.code === '1061007' || (err?.message && err.message.includes('delete'))) {
          console.warn(`Feishu Sync: old file already deleted for ${file.path}, skipping delete`);
        } else {
          throw err;
        }
      }
    }

    const targetFolderToken = await this.ensureFolderPath(file.path);
    const vaultBasePath = (this.plugin.app.vault.adapter as any).getBasePath();

    const result = await this.bridge.uploadFile(file.path, targetFolderToken, file.name, vaultBasePath);
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
      try {
        const targetFolder = await this.ensureFolderPath(file.path);
        await this.bridge.moveFile(state.feishuFileToken, targetFolder);
        this.tracker.removeFileState(oldPath);
        this.tracker.updateFileState(file.path, state.feishuFileToken, file.stat.mtime);
      } catch (err) {
        console.error(`Failed to move drive file for ${file.path}:`, err);
      }
    }
  }
}
