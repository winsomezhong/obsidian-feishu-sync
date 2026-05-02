import { describe, it, expect } from 'vitest';
import { ConflictResolver } from './conflict-resolver';

describe('ConflictResolver', () => {
  const resolver = new ConflictResolver();

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
