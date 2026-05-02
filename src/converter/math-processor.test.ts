import { describe, it, expect } from 'vitest';
import { MathProcessor } from './math-processor';

describe('MathProcessor', () => {
  it('passes inline math through', () => {
    const p = new MathProcessor();
    expect(p.process('text $x^2$ end')).toBe('text $x^2$ end');
  });

  it('passes block math through', () => {
    const p = new MathProcessor();
    expect(p.process('$$\nx^2\n$$')).toBe('$$\nx^2\n$$');
  });
});
