import { describe, it, expect, beforeEach } from 'vitest';
import { SyncStatusTracker } from './sync-status-tracker';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('SyncStatusTracker', () => {
  const testDir = path.join(os.tmpdir(), 'feishu-sync-test');
  let tracker: SyncStatusTracker;

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    tracker = new SyncStatusTracker(testDir);
  });

  it('loads empty state when no data file exists', () => {
    expect(tracker.getAllFiles()).toEqual([]);
  });

  it('loads empty state on corrupted JSON', () => {
    fs.writeFileSync(path.join(testDir, 'sync-state.json'), 'not json');
    tracker = new SyncStatusTracker(testDir);
    expect(tracker.getAllFiles()).toEqual([]);
  });

  it('writes to sync-state.json not data.json', () => {
    tracker.updateFileState('note.md', 'file123', 1000);
    expect(fs.existsSync(path.join(testDir, 'data.json'))).toBe(false);
    expect(fs.existsSync(path.join(testDir, 'sync-state.json'))).toBe(true);
  });

  it('persists and retrieves file state with feishuFileToken', () => {
    tracker.updateFileState('note.md', 'file123', 1000);
    const state = tracker.getFileState('note.md');
    expect(state?.localPath).toBe('note.md');
    expect(state?.feishuFileToken).toBe('file123');
    expect(state?.lastLocalMtime).toBe(1000);
    expect(typeof state?.lastSyncedAt).toBe('number');
  });

  it('removes file state', () => {
    tracker.updateFileState('note.md', 'file123', 1000);
    tracker.removeFileState('note.md');
    expect(tracker.getFileState('note.md')).toBeNull();
    expect(tracker.getAllFiles()).toHaveLength(0);
  });

  it('returns null for unknown file', () => {
    expect(tracker.getFileState('nonexistent.md')).toBeNull();
  });

  it('persists data across tracker instances', () => {
    tracker.updateFileState('note.md', 'file123', 1000);
    const tracker2 = new SyncStatusTracker(testDir);
    expect(tracker2.getFileState('note.md')?.feishuFileToken).toBe('file123');
  });

  it('clears state when legacy feishuDocToken field detected', () => {
    const legacyState = {
      files: {
        'old.md': {
          localPath: 'old.md',
          feishuDocToken: 'docOld123',
          lastSyncedAt: 1000,
          lastLocalMtime: 900,
        },
      },
    };
    fs.writeFileSync(path.join(testDir, 'sync-state.json'), JSON.stringify(legacyState));
    const newTracker = new SyncStatusTracker(testDir);
    expect(newTracker.getAllFiles()).toHaveLength(0);
  });

  it('preserves state with feishuFileToken field', () => {
    const validState = {
      files: {
        'good.md': {
          localPath: 'good.md',
          feishuFileToken: 'fileGood456',
          lastSyncedAt: 2000,
          lastLocalMtime: 1900,
        },
      },
    };
    fs.writeFileSync(path.join(testDir, 'sync-state.json'), JSON.stringify(validState));
    const newTracker = new SyncStatusTracker(testDir);
    expect(newTracker.getFileState('good.md')?.feishuFileToken).toBe('fileGood456');
  });

  it('updateFileState with new optional fields sets isOnlineDoc and docType', () => {
    tracker.updateFileState('online.md', 'token123', 1000, {
      isOnlineDoc: true,
      docType: 'docx',
      remoteModifiedAt: '2026-05-04T12:00:00Z',
    });
    const state = tracker.getFileState('online.md');
    expect(state?.isOnlineDoc).toBe(true);
    expect(state?.docType).toBe('docx');
    expect(state?.remoteModifiedAt).toBe('2026-05-04T12:00:00Z');
    expect(state?.lastSyncedAtDisplay).toBeDefined();
  });

  it('updateFileState without extra defaults isOnlineDoc to false and docType to null', () => {
    tracker.updateFileState('regular.md', 'token456', 2000);
    const state = tracker.getFileState('regular.md');
    expect(state?.isOnlineDoc).toBe(false);
    expect(state?.docType).toBeNull();
    expect(state?.remoteModifiedAt).toBeUndefined();
  });

  it('persists new optional fields across tracker instances', () => {
    tracker.updateFileState('persisted.md', 'token789', 3000, {
      isOnlineDoc: true,
      docType: 'sheet',
      remoteModifiedAt: '2026-05-04T14:00:00Z',
    });
    const tracker2 = new SyncStatusTracker(testDir);
    const state = tracker2.getFileState('persisted.md');
    expect(state?.isOnlineDoc).toBe(true);
    expect(state?.docType).toBe('sheet');
    expect(state?.remoteModifiedAt).toBe('2026-05-04T14:00:00Z');
  });
});
