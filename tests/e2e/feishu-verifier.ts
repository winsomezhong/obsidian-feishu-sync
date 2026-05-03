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

export function listFiles(folderToken: string): DriveFile[] {
  const params = JSON.stringify({ folder_token: folderToken });
  const escapedParams = params.replace(/"/g, '\\"');
  const stdout = cmd(`drive files list --params "${escapedParams}" --page-all`);
  const files = JSON.parse(stdout).data?.files;
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
  const outputPath = path.join(tmpDir, 'downloaded.md');
  try {
    cmd(`drive +download --file-token "${fileToken}" --path "${outputPath}"`);
    return fs.readFileSync(outputPath, 'utf-8');
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
