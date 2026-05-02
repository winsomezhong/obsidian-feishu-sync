import { describe, it, expect } from 'vitest';
import { WikilinkProcessor } from './wikilink-processor';

describe('WikilinkProcessor', () => {
  it('extracts display text from [[target|text]]', () => {
    const p = new WikilinkProcessor('keep-text');
    expect(p.process('See [[note|my note]]')).toBe('See my note');
  });

  it('uses target as fallback when no display text', () => {
    const p = new WikilinkProcessor('keep-text');
    expect(p.process('See [[note]]')).toBe('See note');
  });

  it('strips wikilinks when strategy is strip', () => {
    const p = new WikilinkProcessor('strip');
    expect(p.process('See [[note|text]]')).toBe('See ');
  });
});
