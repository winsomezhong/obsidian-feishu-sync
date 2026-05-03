import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from './settings-tab';

describe('DEFAULT_SETTINGS', () => {
  it('has folderPath, resolvedFolderToken, folderResolutionError, and syncOnSave', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('folderPath');
    expect(DEFAULT_SETTINGS).toHaveProperty('resolvedFolderToken');
    expect(DEFAULT_SETTINGS).toHaveProperty('folderResolutionError');
    expect(DEFAULT_SETTINGS).toHaveProperty('syncOnSave');
  });

  it('folderPath defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.folderPath).toBe('');
  });

  it('resolvedFolderToken defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.resolvedFolderToken).toBe('');
  });

  it('folderResolutionError defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.folderResolutionError).toBe('');
  });

  it('syncOnSave defaults to true', () => {
    expect(DEFAULT_SETTINGS.syncOnSave).toBe(true);
  });
});
