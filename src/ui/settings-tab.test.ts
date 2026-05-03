import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from './settings-tab';

describe('DEFAULT_SETTINGS', () => {
  it('has default folderPath as empty string', () => {
    expect(DEFAULT_SETTINGS.folderPath).toBe('');
  });

  it('has default resolvedFolderToken as empty string', () => {
    expect(DEFAULT_SETTINGS.resolvedFolderToken).toBe('');
  });

  it('legacy folderToken field no longer exists in defaults', () => {
    expect((DEFAULT_SETTINGS as any).folderToken).toBeUndefined();
  });

  it('has syncOnSave enabled by default', () => {
    expect(DEFAULT_SETTINGS.syncOnSave).toBe(true);
  });

  it('has frontmatter strategy set to strip', () => {
    expect(DEFAULT_SETTINGS.processorConfig.frontmatter).toBe('strip');
  });

  it('has all processor strategies defined', () => {
    expect(DEFAULT_SETTINGS.processorConfig.wikilink).toBeDefined();
    expect(DEFAULT_SETTINGS.processorConfig.tag).toBeDefined();
    expect(DEFAULT_SETTINGS.processorConfig.dataview).toBeDefined();
    expect(DEFAULT_SETTINGS.processorConfig.image).toBeDefined();
    expect(DEFAULT_SETTINGS.processorConfig.tableMaxRows).toBe(9);
    expect(DEFAULT_SETTINGS.processorConfig.callout).toBeDefined();
    expect(DEFAULT_SETTINGS.processorConfig.math).toBeDefined();
  });
});
