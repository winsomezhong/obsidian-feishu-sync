export interface UploadResult {
  fileToken: string;
  url: string;
}

export type PreflightResult =
  | { success: true; cliVersion?: string; authReady: boolean }
  | { success: false; error: string; errorCode?: string };
