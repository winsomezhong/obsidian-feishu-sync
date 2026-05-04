import { FileSyncState } from './sync-status-tracker';
import type { SyncDirection } from '../types';

export class ConflictResolver {
  resolve(mtime: number, state: FileSyncState | null): 'needs-sync' | 'skip' {
    if (!state) return 'needs-sync';
    if (mtime > state.lastLocalMtime) return 'needs-sync';
    return 'skip';
  }

  resolveBidirectional(
    localMtime: number,
    remoteModifiedAt: number | string,
    state: FileSyncState | null,
  ): SyncDirection {
    if (!state) return 'pull';

    const localChanged = localMtime > state.lastLocalMtime;
    const remoteTime = typeof remoteModifiedAt === 'string'
      ? new Date(remoteModifiedAt).getTime()
      : remoteModifiedAt;
    const remoteChanged = remoteTime > state.lastLocalMtime;

    if (!localChanged && !remoteChanged) return 'skip';
    if (localChanged && !remoteChanged) {
      if (state.isOnlineDoc) return 'skip';
      return 'push';
    }
    if (!localChanged && remoteChanged) return 'pull';
    // Both changed
    return 'conflict';
  }
}
