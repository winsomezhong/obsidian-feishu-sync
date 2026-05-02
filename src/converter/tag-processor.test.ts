import { describe, it, expect } from 'vitest';
import { TagProcessor } from './tag-processor';

describe('TagProcessor', () => {
  it('keeps tags inline', () => {
    const p = new TagProcessor('keep-inline');
    expect(p.process('#important note')).toBe('#important note');
  });

  it('strips tags', () => {
    const p = new TagProcessor('strip');
    expect(p.process('#important #todo note')).toBe('  note');
  });

  it('handles tags with slashes (nested tags)', () => {
    const p = new TagProcessor('keep-inline');
    expect(p.process('#project/backend')).toBe('#project/backend');
  });
});
