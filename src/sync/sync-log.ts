export interface SyncLogEntry {
  timestamp: number;
  filePath: string;
  operation: 'create' | 'update' | 'delete' | 'skip' | 'error';
  status: 'success' | 'failure';
  errorMessage?: string;
}

const MAX_LOG_ENTRIES = 200;

export class SyncLog {
  private entries: SyncLogEntry[] = [];

  add(entry: SyncLogEntry): void {
    this.entries.unshift(entry);
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_LOG_ENTRIES);
    }
  }

  getAll(): SyncLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
