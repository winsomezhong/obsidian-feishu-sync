import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preflightResultToSettings } from '../../src/preflight-utils';
import {
  DEFAULT_SETTINGS,
  getCliStatusDisplay,
  getAuthStatusDisplay,
  getAuthGuidanceText,
} from '../../src/ui/settings-tab';
import type { SyncPluginSettings } from '../../src/ui/settings-tab';
import type { PreflightResult } from '../../src/types';

// ---------------------------------------------------------------------------
// Integration test 1: preflight → preflightResultToSettings → SyncPluginSettings
// ---------------------------------------------------------------------------
describe('Preflight-to-settings persistence flow (integration)', () => {
  function simulateMainOnloadPersistence(result: PreflightResult): SyncPluginSettings {
    // This replicates the exact logic from main.ts onload()
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS };
    const preflightSettings = preflightResultToSettings(result);
    settings.cliVersion = preflightSettings.cliVersion;
    settings.lastPreflightStatus = preflightSettings.lastPreflightStatus;
    settings.lastPreflightTime = preflightSettings.lastPreflightTime;
    if (!result.success) {
      settings.folderResolutionError = result.error || 'Preflight failed';
    }
    return settings;
  }

  it('persists cliVersion and ok status when preflight succeeds', () => {
    const result: PreflightResult = { success: true, cliVersion: '2.0.0', authReady: true };
    const settings = simulateMainOnloadPersistence(result);
    expect(settings.lastPreflightStatus).toBe('ok');
    expect(settings.cliVersion).toBe('2.0.0');
    expect(settings.lastPreflightTime).toBeGreaterThan(0);
    expect(settings.folderResolutionError).toBe('');
  });

  it('persists cli_not_found when CLI is missing and clears cliVersion', () => {
    const result: PreflightResult = { success: false, error: 'lark-cli not found in PATH', errorCode: 'CLI_NOT_FOUND' };
    const settings = simulateMainOnloadPersistence(result);
    expect(settings.lastPreflightStatus).toBe('cli_not_found');
    expect(settings.cliVersion).toBeUndefined();
    expect(settings.folderResolutionError).toContain('not found');
  });

  it('persists auth_required when token is expired and clears cliVersion', () => {
    const result: PreflightResult = { success: false, error: 'Auth not ready', errorCode: 'AUTH_REQUIRED' };
    const settings = simulateMainOnloadPersistence(result);
    expect(settings.lastPreflightStatus).toBe('auth_required');
    expect(settings.cliVersion).toBeUndefined();
  });

  it('persists preflight_crashed when preflight throws unexpectedly', () => {
    const result: PreflightResult = { success: false, error: 'Preflight error: unexpected crash', errorCode: 'PREFLIGHT_CRASHED' };
    const settings = simulateMainOnloadPersistence(result);
    expect(settings.lastPreflightStatus).toBe('preflight_crashed');
    expect(settings.folderResolutionError).toContain('unexpected crash');
  });

  it('maintains other settings fields unchanged when persisting preflight', () => {
    const baseSettings: SyncPluginSettings = {
      ...DEFAULT_SETTINGS,
      folderPath: '/My Sync',
      resolvedFolderToken: 'token_abc',
      syncOnSave: false,
    };
    const result: PreflightResult = { success: true, cliVersion: '1.0.0', authReady: true };
    const preflightSettings = preflightResultToSettings(result);
    const merged: SyncPluginSettings = {
      ...baseSettings,
      cliVersion: preflightSettings.cliVersion,
      lastPreflightStatus: preflightSettings.lastPreflightStatus,
      lastPreflightTime: preflightSettings.lastPreflightTime,
    };
    expect(merged.folderPath).toBe('/My Sync');
    expect(merged.resolvedFolderToken).toBe('token_abc');
    expect(merged.syncOnSave).toBe(false);
    expect(merged.lastPreflightStatus).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Integration test 2: SyncPluginSettings → Display functions
// ---------------------------------------------------------------------------
describe('Settings-to-display flow (integration)', () => {
  it('produces consistent CLI and auth display for full-ok state', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok', cliVersion: '1.5.0' };
    const cli = getCliStatusDisplay(settings);
    const auth = getAuthStatusDisplay(settings);
    const guidance = getAuthGuidanceText(settings);
    expect(cli.text).toBe('lark-cli: ready (v1.5.0)');
    expect(cli.color).toBe('green');
    expect(auth.text).toBe('Authorized');
    expect(auth.color).toBe('green');
    expect(guidance).toBe('');
  });

  it('produces consistent CLI and auth display for cli_not_found state', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'cli_not_found', folderResolutionError: 'lark-cli not found in PATH' };
    const cli = getCliStatusDisplay(settings);
    const auth = getAuthStatusDisplay(settings);
    const guidance = getAuthGuidanceText(settings);
    expect(cli.text).toBe('lark-cli: not ready');
    expect(cli.color).toBe('red');
    expect(auth.text).toBe('Checking...');
    expect(auth.color).toBe('gray');
    expect(guidance).toMatch(/install/i);
  });

  it('produces consistent display for auth_required state', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_required', cliVersion: '1.5.0', folderResolutionError: 'Auth not ready' };
    const cli = getCliStatusDisplay(settings);
    const auth = getAuthStatusDisplay(settings);
    const guidance = getAuthGuidanceText(settings);
    expect(cli.text).toBe('lark-cli: ready (v1.5.0)');
    expect(cli.color).toBe('green');
    expect(auth.text).toBe('Not authorized');
    expect(auth.color).toBe('red');
    expect(guidance).toContain('lark-cli auth login');
  });

  it('produces consistent display for auth_check_failed state', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_check_failed', cliVersion: '1.5.0', folderResolutionError: 'Failed to parse auth status' };
    const cli = getCliStatusDisplay(settings);
    const auth = getAuthStatusDisplay(settings);
    const guidance = getAuthGuidanceText(settings);
    expect(cli.text).toBe('lark-cli: ready (v1.5.0)');
    expect(cli.color).toBe('green');
    expect(auth.text).toBe('Check failed');
    expect(auth.color).toBe('red');
    expect(guidance).toContain('Failed to parse');
  });

  it('produces consistent display for preflight_crashed state', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'preflight_crashed', folderResolutionError: 'Preflight error: network down' };
    const cli = getCliStatusDisplay(settings);
    const auth = getAuthStatusDisplay(settings);
    const guidance = getAuthGuidanceText(settings);
    expect(cli.text).toBe('lark-cli: ready');
    expect(cli.color).toBe('green');
    expect(auth.text).toBe('Check failed');
    expect(auth.color).toBe('red');
    expect(guidance).toContain('Preflight error');
  });

  it('produces consistent display for uninitialized state (no preflight yet)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    const cli = getCliStatusDisplay(settings);
    const auth = getAuthStatusDisplay(settings);
    const guidance = getAuthGuidanceText(settings);
    expect(cli.text).toBe('lark-cli: checking...');
    expect(cli.color).toBe('gray');
    expect(auth.text).toBe('Checking...');
    expect(auth.color).toBe('gray');
    expect(guidance).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Integration test 3: Refresh flow (onRefresh callback simulation)
// ---------------------------------------------------------------------------
describe('Refresh callback flow (integration)', () => {
  let capturedSettings: SyncPluginSettings;

  beforeEach(() => {
    capturedSettings = { ...DEFAULT_SETTINGS };
  });

  // Simulates the onRefresh callback from main.ts
  async function simulateOnRefresh(
    bridgeResult: PreflightResult,
  ): Promise<SyncPluginSettings> {
    const preflightSettings = preflightResultToSettings(bridgeResult);
    capturedSettings.cliVersion = preflightSettings.cliVersion;
    capturedSettings.lastPreflightStatus = preflightSettings.lastPreflightStatus;
    capturedSettings.lastPreflightTime = preflightSettings.lastPreflightTime;
    if (!bridgeResult.success) {
      capturedSettings.folderResolutionError = bridgeResult.error || 'Preflight failed';
    }
    return { ...capturedSettings };
  }

  it('updates settings from preflight on refresh (success)', async () => {
    const result: PreflightResult = { success: true, cliVersion: '3.0.0', authReady: true };
    const updated = await simulateOnRefresh(result);
    expect(updated.lastPreflightStatus).toBe('ok');
    expect(updated.cliVersion).toBe('3.0.0');
    // Display functions reflect updated state
    expect(getCliStatusDisplay(updated).text).toContain('3.0.0');
    expect(getAuthStatusDisplay(updated).text).toBe('Authorized');
  });

  it('updates settings from preflight on refresh (failure)', async () => {
    const result: PreflightResult = { success: false, error: 'Auth expired', errorCode: 'AUTH_REQUIRED' };
    const updated = await simulateOnRefresh(result);
    expect(updated.lastPreflightStatus).toBe('auth_required');
    expect(updated.cliVersion).toBeUndefined();
    // Display functions reflect failure state
    expect(getAuthStatusDisplay(updated).text).toBe('Not authorized');
    expect(getAuthGuidanceText(updated)).toContain('lark-cli auth login');
  });

  it('handles refresh from ok to cli_not_found transition', async () => {
    // Start as ok
    capturedSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok', cliVersion: '1.0.0', lastPreflightTime: 100 };
    // Refresh fails with CLI not found
    const result: PreflightResult = { success: false, error: 'lark-cli not found in PATH', errorCode: 'CLI_NOT_FOUND' };
    const updated = await simulateOnRefresh(result);
    expect(updated.lastPreflightStatus).toBe('cli_not_found');
    expect(updated.cliVersion).toBeUndefined();
    expect(getCliStatusDisplay(updated).text).toBe('lark-cli: not ready');
    expect(getAuthGuidanceText(updated)).toMatch(/install/i);
  });

  it('replaces stale preflight data with fresh data after refresh', async () => {
    // Simulate stale data from 1 hour ago
    const staleTime = Date.now() - 3_600_000;
    capturedSettings = {
      ...DEFAULT_SETTINGS,
      lastPreflightStatus: 'ok',
      cliVersion: '0.9.0',
      lastPreflightTime: staleTime,
    };
    const result: PreflightResult = { success: true, cliVersion: '2.0.0', authReady: true };
    const updated = await simulateOnRefresh(result);
    expect(updated.lastPreflightStatus).toBe('ok');
    expect(updated.cliVersion).toBe('2.0.0');
    expect(updated.lastPreflightTime).toBeGreaterThan(staleTime);
  });
});
