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
    fs.writeFileSync(path.join(testDir, 'data.json'), 'not json');
    tracker = new SyncStatusTracker(testDir);
    expect(tracker.getAllFiles()).toEqual([]);
  });

  it('persists and retrieves file state', () => {
    tracker.updateFileState('note.md', 'doc123', 1000);
    const state = tracker.getFileState('note.md');
    expect(state?.localPath).toBe('note.md');
    expect(state?.feishuDocToken).toBe('doc123');
    expect(state?.lastLocalMtime).toBe(1000);
    expect(typeof state?.lastSyncedAt).toBe('number');
  });

  it('removes file state', () => {
    tracker.updateFileState('note.md', 'doc123', 1000);
    tracker.removeFileState('note.md');
    expect(tracker.getFileState('note.md')).toBeNull();
    expect(tracker.getAllFiles()).toHaveLength(0);
  });

  it('returns null for unknown file', () => {
    expect(tracker.getFileState('nonexistent.md')).toBeNull();
  });

  it('persists data across tracker instances', () => {
    tracker.updateFileState('note.md', 'doc123', 1000);
    const tracker2 = new SyncStatusTracker(testDir);
    expect(tracker2.getFileState('note.md')?.feishuDocToken).toBe('doc123');
  });
});
