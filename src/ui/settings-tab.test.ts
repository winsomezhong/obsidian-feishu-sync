import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, getCliStatusDisplay, getAuthStatusDisplay, getAuthGuidanceText } from './settings-tab';
import type { SyncPluginSettings } from './settings-tab';
import { TRANSLATIONS } from '../i18n';

describe('DEFAULT_SETTINGS', () => {
  it('has folderPath, resolvedFolderToken, folderResolutionError, syncOnSave, cliVersion, lastPreflightStatus, lastPreflightTime, and language', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('folderPath');
    expect(DEFAULT_SETTINGS).toHaveProperty('resolvedFolderToken');
    expect(DEFAULT_SETTINGS).toHaveProperty('folderResolutionError');
    expect(DEFAULT_SETTINGS).toHaveProperty('syncOnSave');
    expect(DEFAULT_SETTINGS).toHaveProperty('cliVersion');
    expect(DEFAULT_SETTINGS).toHaveProperty('lastPreflightStatus');
    expect(DEFAULT_SETTINGS).toHaveProperty('lastPreflightTime');
    expect(DEFAULT_SETTINGS).toHaveProperty('language');
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

  it('cliVersion defaults to undefined', () => {
    expect(DEFAULT_SETTINGS.cliVersion).toBeUndefined();
  });

  it('lastPreflightStatus defaults to undefined', () => {
    expect(DEFAULT_SETTINGS.lastPreflightStatus).toBeUndefined();
  });

  it('lastPreflightTime defaults to undefined', () => {
    expect(DEFAULT_SETTINGS.lastPreflightTime).toBeUndefined();
  });

  it('language defaults to en', () => {
    expect(DEFAULT_SETTINGS.language).toBe('en');
  });
});

describe('getCliStatusDisplay', () => {
  it('returns checking state when no preflight result persisted', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: checking...');
    expect(display.color).toBe('gray');
  });

  it('returns ready with version when CLI is ok', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok', cliVersion: '1.2.3' };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: ready (v1.2.3)');
    expect(display.color).toBe('green');
  });

  it('returns ready without version when cliVersion is missing', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok', cliVersion: undefined };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: ready');
    expect(display.color).toBe('green');
  });

  it('returns not ready when CLI is not installed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'cli_not_found' };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: not ready');
    expect(display.color).toBe('red');
  });

  it('returns ready for auth-related failures (CLI was found)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_required' };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: ready');
    expect(display.color).toBe('green');
  });
});

describe('getAuthStatusDisplay', () => {
  it('returns Checking... when no preflight result persisted', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Checking...');
    expect(display.color).toBe('gray');
  });

  it('returns Authorized when status is ok', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok' };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Authorized');
    expect(display.color).toBe('green');
  });

  it('returns Not authorized when auth is required', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_required' };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Not authorized');
    expect(display.color).toBe('red');
  });

  it('returns Check failed when auth check failed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_check_failed' };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Check failed');
    expect(display.color).toBe('red');
  });

  it('returns Check failed when preflight crashed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'preflight_crashed' };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Check failed');
    expect(display.color).toBe('red');
  });
});

describe('getAuthGuidanceText', () => {
  it('returns empty string when status is ok', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok' };
    expect(getAuthGuidanceText(settings)).toBe('');
  });

  it('returns empty string when status is undefined', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    expect(getAuthGuidanceText(settings)).toBe('');
  });

  it('returns re-auth guide when auth_required', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_required' };
    const text = getAuthGuidanceText(settings);
    expect(text).toContain('lark-cli auth login');
  });

  it('returns error message when auth_check_failed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_check_failed', folderResolutionError: 'Failed to parse auth status' };
    const text = getAuthGuidanceText(settings);
    expect(text).toContain('Failed to parse');
  });

  it('returns error message when preflight_crashed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'preflight_crashed', folderResolutionError: 'Preflight error: network' };
    const text = getAuthGuidanceText(settings);
    expect(text).toContain('Preflight error');
  });

  it('returns CLI install guide when cli_not_found', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'cli_not_found' };
    const text = getAuthGuidanceText(settings);
    expect(text).toMatch(/install/i);
    expect(text).toContain('lark-cli');
  });
});

describe('i18n integration', () => {
  it('getCliStatusDisplay ready text matches cliReady translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok', cliVersion: undefined };
    expect(getCliStatusDisplay(settings).text).toBe(TRANSLATIONS.cliReady.en);
  });

  it('getCliStatusDisplay checking text matches cliChecking translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    expect(getCliStatusDisplay(settings).text).toBe(TRANSLATIONS.cliChecking.en);
  });

  it('getCliStatusDisplay not-ready text matches cliNotReady translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'cli_not_found' };
    expect(getCliStatusDisplay(settings).text).toBe(TRANSLATIONS.cliNotReady.en);
  });

  it('getAuthStatusDisplay authorized text matches authAuthorized translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok' };
    expect(getAuthStatusDisplay(settings).text).toBe(TRANSLATIONS.authAuthorized.en);
  });

  it('getAuthStatusDisplay not-authorized text matches authNotAuthorized translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_required' };
    expect(getAuthStatusDisplay(settings).text).toBe(TRANSLATIONS.authNotAuthorized.en);
  });

  it('getAuthStatusDisplay checking text matches authChecking translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    expect(getAuthStatusDisplay(settings).text).toBe(TRANSLATIONS.authChecking.en);
  });

  it('getAuthStatusDisplay check-failed text matches authCheckFailed translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_check_failed' };
    expect(getAuthStatusDisplay(settings).text).toBe(TRANSLATIONS.authCheckFailed.en);
  });

  it('SyncPluginSettings language field accepts en and zh', () => {
    const enSettings: SyncPluginSettings = { ...DEFAULT_SETTINGS, language: 'en' };
    const zhSettings: SyncPluginSettings = { ...DEFAULT_SETTINGS, language: 'zh' };
    expect(enSettings.language).toBe('en');
    expect(zhSettings.language).toBe('zh');
  });
});
