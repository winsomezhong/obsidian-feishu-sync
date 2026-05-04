import type { PreflightResult, PreflightStatus } from './types';

export interface PreflightSettings {
  cliVersion?: string;
  lastPreflightStatus: PreflightStatus;
  lastPreflightTime: number;
}

export function preflightResultToSettings(result: PreflightResult): PreflightSettings {
  let lastPreflightStatus: PreflightStatus;
  const cliVersion = result.success ? result.cliVersion : undefined;

  if (!result.success) {
    switch (result.errorCode) {
      case 'CLI_NOT_FOUND': lastPreflightStatus = 'cli_not_found'; break;
      case 'AUTH_REQUIRED': lastPreflightStatus = 'auth_required'; break;
      case 'AUTH_CHECK_FAILED': lastPreflightStatus = 'auth_check_failed'; break;
      case 'INSUFFICIENT_SCOPE': lastPreflightStatus = 'insufficient_scope'; break;
      default: lastPreflightStatus = 'preflight_crashed';
    }
  } else {
    lastPreflightStatus = 'ok';
  }

  return { cliVersion, lastPreflightStatus, lastPreflightTime: Date.now() };
}
