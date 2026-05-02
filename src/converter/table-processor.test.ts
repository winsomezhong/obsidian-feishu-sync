import { describe, it, expect } from 'vitest';
import { TableProcessor } from './table-processor';

describe('TableProcessor', () => {
  it('splits table exceeding max rows', () => {
    const p = new TableProcessor(3);
    const input = `| H |\n|---|\n| a |\n| b |\n| c |\n| d |`;
    const result = p.process(input);
    expect((result.match(/H/g) || []).length).toBe(2);
  });

  it('passes short tables through', () => {
    const p = new TableProcessor(9);
    const input = '| H |\n|---|\n| a |\n| b |';
    expect(p.process(input)).toBe(input);
  });

  it('does not affect content without tables', () => {
    const p = new TableProcessor(9);
    expect(p.process('# Hello')).toBe('# Hello');
  });
});
