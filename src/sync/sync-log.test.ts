import { describe, it, expect } from 'vitest';
import { SyncLog } from './sync-log';

describe('SyncLog', () => {
  it('adds entries in reverse chronological order', () => {
    const log = new SyncLog();
    log.add({ timestamp: 1, filePath: 'a.md', operation: 'create', status: 'success' });
    log.add({ timestamp: 2, filePath: 'b.md', operation: 'update', status: 'success' });
    expect(log.getAll()[0].filePath).toBe('b.md');
  });

  it('caps at 200 entries', () => {
    const log = new SyncLog();
    for (let i = 0; i < 210; i++) {
      log.add({ timestamp: i, filePath: `${i}.md`, operation: 'create', status: 'success' });
    }
    expect(log.getAll().length).toBe(200);
  });

  it('clears all entries', () => {
    const log = new SyncLog();
    log.add({ timestamp: 1, filePath: 'a.md', operation: 'create', status: 'success' });
    log.clear();
    expect(log.getAll()).toHaveLength(0);
  });
});
