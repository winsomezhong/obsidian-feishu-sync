import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockNotice = vi.hoisted(() => vi.fn());
vi.mock('obsidian', () => ({
  Notice: mockNotice,
}));

import { SyncNotifier } from './sync-notifier';

describe('SyncNotifier', () => {
  beforeEach(() => {
    mockNotice.mockClear();
  });

  describe('notifySingle', () => {
    it('shows success notice with short duration (3000ms)', () => {
      SyncNotifier.notifySingle('meeting-notes.md', true);
      expect(mockNotice).toHaveBeenCalledWith('Synced meeting-notes.md to Feishu', 3000);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });

    it('shows failure notice with error message and long duration (10000ms)', () => {
      SyncNotifier.notifySingle('broken.md', false, 'Network timeout');
      expect(mockNotice).toHaveBeenCalledWith('Failed to sync broken.md: Network timeout', 10000);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });

    it('shows failure notice without error message', () => {
      SyncNotifier.notifySingle('unknown.md', false);
      expect(mockNotice).toHaveBeenCalledWith('Failed to sync unknown.md', 10000);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyBatch', () => {
    it('shows success count when all files succeed (8000ms)', () => {
      SyncNotifier.notifyBatch(5, 0);
      expect(mockNotice).toHaveBeenCalledWith('Synced 5 file(s) to Feishu', 8000);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });

    it('shows success count for single file', () => {
      SyncNotifier.notifyBatch(1, 0);
      expect(mockNotice).toHaveBeenCalledWith('Synced 1 file(s) to Feishu', 8000);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });

    it('shows partial success with both counts (10000ms)', () => {
      SyncNotifier.notifyBatch(3, 2);
      expect(mockNotice).toHaveBeenCalledWith('Synced 3 file(s), 2 failed', 10000);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });

    it('shows first error when all files fail', () => {
      const errors = [
        { path: 'a.md', error: new Error('Permission denied') },
        { path: 'b.md', error: new Error('Timeout') },
      ];
      SyncNotifier.notifyBatch(0, 2, errors);
      expect(mockNotice).toHaveBeenCalledWith('Sync failed: Permission denied', 10000);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });

    it('shows generic message when all files fail without errors', () => {
      SyncNotifier.notifyBatch(0, 2);
      expect(mockNotice).toHaveBeenCalledWith('Sync failed: Unknown error', 10000);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });

    it('shows zero counts when nothing synced', () => {
      SyncNotifier.notifyBatch(0, 0);
      expect(mockNotice).toHaveBeenCalledWith('Synced 0 file(s) to Feishu', 8000);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifySingle edge cases', () => {
    it('handles filename with special characters', () => {
      SyncNotifier.notifySingle('file (1).md', true);
      expect(mockNotice).toHaveBeenCalledWith('Synced file (1).md to Feishu', 3000);
    });
  });

  describe('notifyBatch edge cases', () => {
    it('handles large numbers', () => {
      SyncNotifier.notifyBatch(100, 3);
      expect(mockNotice).toHaveBeenCalledWith('Synced 100 file(s), 3 failed', 10000);
    });

    it('handles errors with empty message', () => {
      const errors = [{ path: 'a.md', error: new Error('') }];
      SyncNotifier.notifyBatch(0, 1, errors);
      expect(mockNotice).toHaveBeenCalledWith('Sync failed: ', 10000);
    });
  });
});
