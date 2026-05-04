export interface UploadResult {
  fileToken: string;
  url: string;
}

export interface FolderResolutionResult {
  folderToken: string;
  resolvedPath: string;
}

export type PreflightStatus = 'ok' | 'cli_not_found' | 'auth_required' | 'auth_check_failed' | 'preflight_crashed' | 'insufficient_scope';

export type PreflightResult =
  | { success: true; cliVersion?: string; authReady: boolean }
  | { success: false; error: string; errorCode?: string; missingScopes?: string[] };

export type SyncDirection = 'push' | 'pull' | 'skip' | 'conflict';

export interface RemoteFile {
  token: string;
  name: string;
  type: 'file' | 'docx' | 'sheet' | 'bitable' | 'folder';
  modifiedAt: string;
}
