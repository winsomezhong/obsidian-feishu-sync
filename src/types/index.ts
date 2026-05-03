export interface UploadResult {
  fileToken: string;
  url: string;
}

export interface FolderResolutionResult {
  folderToken: string;
  resolvedPath: string;
}

export type PreflightStatus = 'ok' | 'cli_not_found' | 'auth_required' | 'auth_check_failed' | 'preflight_crashed';

export type PreflightResult =
  | { success: true; cliVersion?: string; authReady: boolean }
  | { success: false; error: string; errorCode?: string };
