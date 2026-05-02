import { describe, it, expect } from 'vitest';
import { Preprocessor } from './preprocessor';

describe('Preprocessor', () => {
  it('processes content through all enabled processors in order', () => {
    const pp = new Preprocessor({ frontmatter: 'strip', wikilink: 'keep-text', tag: 'strip', dataview: 'strip', image: 'strip', tableMaxRows: 9, callout: 'strip-type', math: 'keep' });
    const result = pp.process('---\ntitle: T\n---\n\n# Hello [[wikilink|text]] #tag\n\n```dataview\nTABLE\n```');
    expect(result.content).not.toContain('title: T');
    expect(result.content).toContain('Hello');
    expect(result.content).toContain('text');
    expect(result.content).not.toContain('[[wikilink|text]]');
  });

  it('returns ProcessResult with metadata', () => {
    const pp = new Preprocessor();
    const result = pp.process('# Hello');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('metadata');
    expect(typeof result.content).toBe('string');
  });
});
