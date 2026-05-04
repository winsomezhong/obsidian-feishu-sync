import { ApiError } from './bridge/feishu-cli-bridge';

const AUTH_ERROR_CODES = new Set(['99991663', '99991664', '99991677', '99991668']);
const AUTH_ERROR_PATTERNS = [
  /token expired/i,
  /token invalid/i,
  /authentication/i,
  /unauthorized/i,
  /access denied/i,
];

export function isAuthApiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (AUTH_ERROR_CODES.has(err.code)) return true;
    for (const pattern of AUTH_ERROR_PATTERNS) {
      if (pattern.test(err.message)) return true;
    }
    return false;
  }
  if (err instanceof Error) {
    for (const pattern of AUTH_ERROR_PATTERNS) {
      if (pattern.test(err.message)) return true;
    }
  }
  return false;
}
