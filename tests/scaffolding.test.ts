import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('project scaffolding', () => {
  it('tsconfig.json should exist and be valid JSON', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf-8');
    const config = JSON.parse(raw);
    expect(config.compilerOptions.strict).toBe(true);
    expect(config.compilerOptions.target).toBe('ES2020');
    expect(config.include).toContain('src/**/*.ts');
  });

  it('rollup.config.mjs should exist', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'rollup.config.mjs'), 'utf-8');
    expect(raw).toContain("input: 'src/main.ts'");
    expect(raw).toContain("external: ['obsidian']");
  });

  it('manifest.json should have correct metadata', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(raw);
    expect(manifest.id).toBe('obsidian-feishu-sync');
    expect(manifest.isDesktopOnly).toBe(true);
    expect(manifest.version).toBe('0.1.0');
  });

  it('src/main.ts should export a Plugin class', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'src', 'main.ts'), 'utf-8');
    expect(raw).toContain("import { Plugin, Notice } from 'obsidian'");
    expect(raw).toContain('export default class FeishuSyncPlugin extends Plugin');
    expect(raw).toContain('async onload()');
    expect(raw).toContain('async onunload()');
  });

  it('directory structure should exist', () => {
    const dirs = ['sync', 'converter', 'bridge', 'ui'];
    for (const dir of dirs) {
      const fullPath = path.join(ROOT, 'src', dir);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).isDirectory()).toBe(true);
    }
  });

  it('build output main.js should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'main.js'))).toBe(true);
  });
});
