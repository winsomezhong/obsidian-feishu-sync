import { describe, it, expect } from 'vitest';
import { ImageProcessor } from './image-processor';

describe('ImageProcessor', () => {
  it('replaces ![[image.png]] with placeholder', () => {
    const p = new ImageProcessor('upload');
    const result = p.process('Text ![[img.png]] more');
    expect(result).toContain('[image: img.png]');
  });

  it('strips image references', () => {
    const p = new ImageProcessor('strip');
    expect(p.process('![[img.png]]')).toBe('');
  });

  it('handles markdown image syntax', () => {
    const p = new ImageProcessor('upload');
    expect(p.process('![](path/img.jpg)')).toContain('[image: path/img.jpg]');
  });
});
