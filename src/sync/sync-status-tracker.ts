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
