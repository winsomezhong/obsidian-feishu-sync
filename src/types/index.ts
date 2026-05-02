export interface DocumentResult {
  documentId: string;
  url: string;
}

export interface PreflightResult {
  success: boolean;
  cliVersion?: string;
  authReady?: boolean;
  error?: string;
  errorCode?: string;
}
