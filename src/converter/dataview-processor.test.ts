import { describe, it, expect } from 'vitest';
import { DataviewProcessor } from './dataview-processor';

describe('DataviewProcessor', () => {
  it('comments out dataview blocks', () => {
    const p = new DataviewProcessor('comment-out');
    const result = p.process('text\n```dataview\nTABLE\n```\nmore');
    expect(result).toContain('<!--');
    expect(result).toContain('-->');
  });

  it('strips dataviewjs blocks', () => {
    const p = new DataviewProcessor('strip');
    expect(p.process('a\n```dataviewjs\ncalc\n```\nb')).toBe('a\nb');
  });

  it('passes regular code blocks through', () => {
    const p = new DataviewProcessor('comment-out');
    expect(p.process('```js\nconsole.log(1)\n```')).toBe('```js\nconsole.log(1)\n```');
  });
});
