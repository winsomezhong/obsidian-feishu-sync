import { execSync } from 'child_process';
import { e2eConfig } from './e2e.config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DriveFile {
  name: string;
  token: string;
  type: 'file' | 'folder';
}

function cmd(args: string): string {
  return execSync(`${e2eConfig.larkExe} ${args}`, {
    encoding: 'utf-8',
    timeout: 30000,
  }) as unknown as string;
}

let _rootFolderTokenCache: string | null = null;

/** Resolve root folder token from folderPath or folderToken config */
export function getRootFolderToken(): string {
  if (_rootFolderTokenCache) return _rootFolderTokenCache;

  // Prefer folderPath: resolve it to token via lark-cli
  if (e2eConfig.folderPath) {
    const stdout = cmd(
      `drive +search --query "${e2eConfig.folderPath}" --doc-types folder`,
    );
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(`Failed to resolve folder path: ${e2eConfig.folderPath}`);
    }
    const results = parsed?.data?.results;
    const folders = results?.filter((r: any) => r?.result_meta?.doc_types === 'FOLDER') || [];
    if (folders.length === 0) {
      throw new Error(`Folder path not found: ${e2eConfig.folderPath}`);
    }
    _rootFolderTokenCache = folders[0].result_meta.token;
    return _rootFolderTokenCache;
  }

  // Fallback: use folderToken directly
  if (e2eConfig.folderToken) {
    _rootFolderTokenCache = e2eConfig.folderToken;
    return e2eConfig.folderToken;
  }

  throw new Error('FEISHU_FOLDER_PATH or FEISHU_FOLDER_TOKEN env var is required');
}

export function listFiles(folderToken: string): DriveFile[] {
  const params = JSON.stringify({ folder_token: folderToken });
  const escapedParams = params.replace(/"/g, '\\"');
  const stdout = cmd(`drive files list --params "${escapedParams}" --page-all`);
  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse lark-cli output as JSON:\n${stdout.slice(0, 500)}`);
  }
  const files = parsed.data?.files;
  if (!files || !Array.isArray(files)) return [];
  return files.map((f: any) => ({ name: f.name, token: f.token, type: f.type }));
}

export function findFile(folderToken: string, fileName: string): DriveFile | null {
  const files = listFiles(folderToken);
  return files.find(f => f.name === fileName && f.type === 'file') ?? null;
}

export function fileExists(folderToken: string, fileName: string): boolean {
  return findFile(folderToken, fileName) !== null;
}

export function getFileContent(fileToken: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feishu-e2e-'));
  const outputName = 'downloaded.md';
  try {
    execSync(`${e2eConfig.larkExe} drive +download --file-token "${fileToken}" --output "${outputName}"`, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: tmpDir,
    });
    return fs.readFileSync(path.join(tmpDir, outputName), 'utf-8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function deleteFileByToken(fileToken: string): void {
  cmd(`drive +delete --file-token "${fileToken}" --type file --yes`);
}

export function findSubfolder(folderToken: string, folderName: string): string | null {
  const files = listFiles(folderToken);
  const found = files.find(f => f.name === folderName && f.type === 'folder');
  return found?.token ?? null;
}
