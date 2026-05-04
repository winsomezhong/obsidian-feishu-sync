import { describe, it, expect } from 'vitest';
import { preflightResultToSettings } from './preflight-utils';
import { isAuthApiError } from './auth-error-detector';
import { ApiError } from './bridge/feishu-cli-bridge';
import type { PreflightResult, PreflightStatus } from './types';

describe('isAuthApiError', () => {
  it('returns true for known auth error codes', () => {
    expect(isAuthApiError(new ApiError(1, 'token expired', '99991677'))).toBe(true);
    expect(isAuthApiError(new ApiError(1, 'token expired', '99991663'))).toBe(true);
    expect(isAuthApiError(new ApiError(1, 'token expired', '99991664'))).toBe(true);
    expect(isAuthApiError(new ApiError(1, 'token expired', '99991668'))).toBe(true);
  });

  it('returns true for auth-related message patterns', () => {
    expect(isAuthApiError(new ApiError(1, 'Authentication token expired', '1'))).toBe(true);
    expect(isAuthApiError(new ApiError(1, 'Token invalid', '2'))).toBe(true);
    expect(isAuthApiError(new ApiError(1, 'Unauthorized access', '3'))).toBe(true);
    expect(isAuthApiError(new ApiError(1, 'Access denied', '4'))).toBe(true);
  });

  it('returns false for non-auth ApiError', () => {
    expect(isAuthApiError(new ApiError(1, 'Folder not found', '100'))).toBe(false);
    expect(isAuthApiError(new ApiError(1, 'Rate limit exceeded', '200'))).toBe(false);
  });

  it('returns true for plain Error with auth pattern', () => {
    expect(isAuthApiError(new Error('Authentication failed: token expired'))).toBe(true);
    expect(isAuthApiError(new Error('Token invalid'))).toBe(true);
  });

  it('returns false for plain Error without auth pattern', () => {
    expect(isAuthApiError(new Error('Network timeout'))).toBe(false);
    expect(isAuthApiError(new Error('File not found'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isAuthApiError(null)).toBe(false);
    expect(isAuthApiError(undefined)).toBe(false);
    expect(isAuthApiError('some string')).toBe(false);
  });
});

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

  it('maps INSUFFICIENT_SCOPE error to insufficient_scope status', () => {
    const result: PreflightResult = { success: false, error: 'Missing required scopes: drive:file:upload', errorCode: 'INSUFFICIENT_SCOPE' };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('insufficient_scope');
  });

  it('propagates missingScopes when INSUFFICIENT_SCOPE result includes them', () => {
    const result: PreflightResult = { success: false, error: 'Missing required scopes: drive:file:upload, docx:document:readonly', errorCode: 'INSUFFICIENT_SCOPE', missingScopes: ['drive:file:upload', 'docx:document:readonly'] };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('insufficient_scope');
    expect(settings.lastMissingScopes).toEqual(['drive:file:upload', 'docx:document:readonly']);
  });

  it('does not set lastMissingScopes for non-INSUFFICIENT_SCOPE errors', () => {
    const result: PreflightResult = { success: false, error: 'Auth not ready', errorCode: 'AUTH_REQUIRED' };
    const settings = preflightResultToSettings(result);
    expect(settings.lastPreflightStatus).toBe('auth_required');
    expect(settings.lastMissingScopes).toBeUndefined();
  });

  it('accepts insufficient_scope as a valid PreflightStatus', () => {
    const status: PreflightStatus = 'insufficient_scope';
    expect(status).toBe('insufficient_scope');
  });
});
