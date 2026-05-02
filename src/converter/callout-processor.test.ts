import { describe, it, expect } from 'vitest';
import { CalloutProcessor } from './callout-processor';

describe('CalloutProcessor', () => {
  it('strips [!note] marker from callouts', () => {
    const p = new CalloutProcessor('strip-type');
    expect(p.process('> [!note]\n> content')).toBe('>\n> content');
  });

  it('keeps callouts as-is', () => {
    const p = new CalloutProcessor('keep');
    expect(p.process('> [!warning]\n> text')).toBe('> [!warning]\n> text');
  });
});
