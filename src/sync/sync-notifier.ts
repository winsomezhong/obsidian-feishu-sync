import { Notice } from 'obsidian';

export interface SyncError {
  path: string;
  error: Error;
}

export class SyncNotifier {
  static notifySingle(fileName: string, success: boolean, errorMessage?: string): void {
    if (success) {
      new Notice(`Synced ${fileName} to Feishu`, 3000);
    } else {
      const msg = errorMessage ? `Failed to sync ${fileName}: ${errorMessage}` : `Failed to sync ${fileName}`;
      new Notice(msg, 10000);
    }
  }

  static notifyBatch(successCount: number, failCount: number, errors?: SyncError[]): void {
    if (failCount === 0) {
      new Notice(`Synced ${successCount} file(s) to Feishu`, 8000);
    } else if (successCount === 0 && errors && errors.length > 0) {
      new Notice(`Sync failed: ${errors[0].error.message}`, 10000);
    } else if (successCount === 0) {
      new Notice(`Sync failed: Unknown error`, 10000);
    } else {
      new Notice(`Synced ${successCount} file(s), ${failCount} failed`, 10000);
    }
  }
}
