import { describe, it, expect } from 'vitest';
import { ConflictResolver } from './conflict-resolver';
import type { FileSyncState } from './sync-status-tracker';

describe('ConflictResolver', () => {
  const resolver = new ConflictResolver();

  describe('resolve', () => {
    it('returns needs-sync for new file (no state)', () => {
      expect(resolver.resolve(2000, null)).toBe('needs-sync');
    });

    it('returns skip when mtime <= lastSyncedAt', () => {
      expect(resolver.resolve(1000, { lastLocalMtime: 1000, lastSyncedAt: 2000 } as any)).toBe('skip');
    });

    it('returns needs-sync when mtime > lastLocalMtime', () => {
      expect(resolver.resolve(3000, { lastLocalMtime: 1000, lastSyncedAt: 2000 } as any)).toBe('needs-sync');
    });
  });

  describe('resolveBidirectional', () => {
    const baseState: FileSyncState = {
      localPath: 'note.md',
      feishuFileToken: 'ftok123',
      lastSyncedAt: 1000,
      lastLocalMtime: 1000,
      docType: null,
      isOnlineDoc: false,
    };

    it('returns pull when no state (new remote file)', () => {
      const result = resolver.resolveBidirectional(0, '2026-05-04T12:00:00Z', null);
      expect(result).toBe('pull');
    });

    it('returns pull when no state for online doc', () => {
      const result = resolver.resolveBidirectional(0, '2026-05-04T12:00:00Z', null);
      expect(result).toBe('pull');
    });

    it('returns skip when neither local nor remote changed', () => {
      // localMtime = lastLocalMtime (1000), remoteModifiedAt = 1000 (same as lastLocalMtime)
      const result = resolver.resolveBidirectional(1000, 1000, baseState);
      expect(result).toBe('skip');
    });

    it('returns push when only local changed and isOnlineDoc is false', () => {
      // localMtime > lastLocalMtime, remoteModifiedAt <= lastLocalMtime
      const result = resolver.resolveBidirectional(2000, 900, { ...baseState, isOnlineDoc: false });
      expect(result).toBe('push');
    });

    it('returns skip when only local changed but isOnlineDoc is true', () => {
      const result = resolver.resolveBidirectional(2000, 900, { ...baseState, isOnlineDoc: true });
      expect(result).toBe('skip');
    });

    it('returns pull when only remote changed (regular file)', () => {
      // localMtime <= lastLocalMtime, remoteModifiedAt > lastLocalMtime
      const result = resolver.resolveBidirectional(1000, 2000, { ...baseState, isOnlineDoc: false });
      expect(result).toBe('pull');
    });

    it('returns pull when only remote changed (online doc)', () => {
      const result = resolver.resolveBidirectional(1000, 2000, { ...baseState, isOnlineDoc: true });
      expect(result).toBe('pull');
    });

    it('returns conflict when both local and remote changed (regular file)', () => {
      const result = resolver.resolveBidirectional(2000, 2000, { ...baseState, isOnlineDoc: false });
      expect(result).toBe('conflict');
    });

    it('returns conflict when both local and remote changed (online doc)', () => {
      const result = resolver.resolveBidirectional(2000, 2000, { ...baseState, isOnlineDoc: true });
      expect(result).toBe('conflict');
    });

    it('handles remoteModifiedAt as ISO string', () => {
      // ISO "2026-05-04T12:00:00Z" = 1746432000000 (approximately)
      const result = resolver.resolveBidirectional(1000, '2026-05-04T12:00:00Z', baseState);
      expect(result).toBe('pull');
    });

    it('returns skip when remoteModifiedAt string is equal to lastLocalMtime', () => {
      const isoTime = '2026-05-04T12:00:00Z';
      const expectedTimestamp = new Date(isoTime).getTime();
      const state = { ...baseState, lastLocalMtime: expectedTimestamp };
      const result = resolver.resolveBidirectional(expectedTimestamp, isoTime, state);
      expect(result).toBe('skip');
    });
  });
});
