import { FileSyncState } from './sync-status-tracker';

export class ConflictResolver {
  resolve(mtime: number, state: FileSyncState | null): 'needs-sync' | 'skip' {
    if (!state) return 'needs-sync';
    if (mtime > state.lastLocalMtime) return 'needs-sync';
    return 'skip';
  }
}
