import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from './settings-tab';

describe('DEFAULT_SETTINGS', () => {
  it('has folderToken and syncOnSave (no processorConfig)', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('folderToken');
    expect(DEFAULT_SETTINGS).toHaveProperty('syncOnSave');
    expect(DEFAULT_SETTINGS).not.toHaveProperty('processorConfig');
  });

  it('folderToken defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.folderToken).toBe('');
  });

  it('syncOnSave defaults to true', () => {
    expect(DEFAULT_SETTINGS.syncOnSave).toBe(true);
  });
});
