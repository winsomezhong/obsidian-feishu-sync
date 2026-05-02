import { describe, it, expect } from 'vitest';
import { FrontmatterProcessor } from './frontmatter-processor';

describe('FrontmatterProcessor', () => {
  it('strips frontmatter with --- delimiters', () => {
    const p = new FrontmatterProcessor('strip');
    expect(p.process('---\ntitle: Test\n---\n\n# Content')).toBe('\n# Content');
  });

  it('passes through content without frontmatter', () => {
    const p = new FrontmatterProcessor('strip');
    expect(p.process('# No frontmatter')).toBe('# No frontmatter');
  });

  it('handles empty content', () => {
    const p = new FrontmatterProcessor('strip');
    expect(p.process('')).toBe('');
  });

  it('keeps frontmatter when strategy is keep-as-text', () => {
    const p = new FrontmatterProcessor('keep-as-text');
    const input = '---\ntitle: Test\n---\n\n# Content';
    expect(p.process(input)).toBe(input);
  });
});
