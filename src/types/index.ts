export interface DocumentResult {
  documentId: string;
  url: string;
}

export interface FolderResolutionResult {
  folderToken: string;
  resolvedPath: string;
}

export type PreflightResult =
  | { success: true; cliVersion?: string; authReady: boolean }
  | { success: false; error: string; errorCode?: string };
