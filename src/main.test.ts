import { describe, it, expect } from 'vitest';
import { preflightResultToSettings } from './preflight-utils';
import type { PreflightResult, PreflightStatus } from './types';

describe('preflightResultToSettings', () => {
  it('maps successful preflight to ok status with cliVersion', () => {
    const result: PreflightResult = { success: true, cliVersion: '1.2.3', authReady: true };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('ok');
    expect(settings.cliVersion).toBe('1.2.3');
    expect(settings.lastPreflightTime).toBeGreaterThan(0);
  });

  it('maps successful preflight without cliVersion to ok status', () => {
    const result: PreflightResult = { success: true, authReady: true };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('ok');
    expect(settings.cliVersion).toBeUndefined();
  });

  it('maps CLI_NOT_FOUND error to cli_not_found status', () => {
    const result: PreflightResult = { success: false, error: 'lark-cli not found in PATH', errorCode: 'CLI_NOT_FOUND' };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('cli_not_found');
    expect(settings.cliVersion).toBeUndefined();
  });

  it('maps AUTH_REQUIRED error to auth_required status', () => {
    const result: PreflightResult = { success: false, error: 'Auth not ready', errorCode: 'AUTH_REQUIRED' };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('auth_required');
  });

  it('maps AUTH_CHECK_FAILED error to auth_check_failed status', () => {
    const result: PreflightResult = { success: false, error: 'Failed to parse auth status', errorCode: 'AUTH_CHECK_FAILED' };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('auth_check_failed');
  });

  it('maps PREFLIGHT_CRASHED error to preflight_crashed status', () => {
    const result: PreflightResult = { success: false, error: 'Preflight error: something went wrong', errorCode: 'PREFLIGHT_CRASHED' };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('preflight_crashed');
  });

  it('maps unknown error code to preflight_crashed status', () => {
    const result: PreflightResult = { success: false, error: 'Unknown error', errorCode: 'UNKNOWN' };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('preflight_crashed');
  });

  it('maps error without errorCode to preflight_crashed status', () => {
    const result: PreflightResult = { success: false, error: 'Generic error' };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('preflight_crashed');
  });

  it('always sets a recent timestamp', () => {
    const before = Date.now();
    const result: PreflightResult = { success: true, authReady: true };
    const settings = preflightResultToSettings(result);
    const after = Date.now();
    expect(settings.lastPreflightTime).toBeGreaterThanOrEqual(before);
    expect(settings.lastPreflightTime).toBeLessThanOrEqual(after);
  });

  it('accepts insufficient_scope as a valid PreflightStatus', () => {
    const status: PreflightStatus = 'insufficient_scope';
    expect(status).toBe('insufficient_scope');
  });
});
