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

export function createFolder(parentToken: string, folderName: string): string {
  const stdout = cmd(`drive +create-folder --folder-token "${parentToken}" --name "${folderName}"`);
  const parsed = JSON.parse(stdout);
  return parsed.data.folder_token;
}

export function deleteFileByToken(fileToken: string): void {
  cmd(`drive +delete --file-token "${fileToken}" --type file --yes`);
}

export function findSubfolder(folderToken: string, folderName: string): string | null {
  const files = listFiles(folderToken);
  const found = files.find(f => f.name === folderName && f.type === 'folder');
  return found?.token ?? null;
}

export function resolveFolderPath(folderPath: string): string | null {
  if (!folderPath) return null;
  const escapedPath = folderPath.includes(' ') ? `"${folderPath}"` : folderPath;
  const stdout = cmd(`drive +search --query ${escapedPath} --doc-types folder`);
  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const results = parsed?.data?.results;
  if (!results || !Array.isArray(results) || results.length === 0) return null;
  const folders = results.filter(
    (r: any) => r?.result_meta?.doc_types === 'FOLDER',
  );
  if (folders.length === 0) return null;
  return folders[0].result_meta?.token ?? null;
}

export function uploadFile(localPath: string, folderToken: string): string {
  const name = path.basename(localPath);
  const dir = path.dirname(localPath);
  const stdout = execSync(
    `${e2eConfig.larkExe} drive +upload --file "${name}" --folder-token "${folderToken}" --name "${name}"`,
    { encoding: 'utf-8', timeout: 30000, cwd: dir },
  ) as unknown as string;
  const parsed = JSON.parse(stdout);
  return parsed.data.file_token;
}

export function importDocx(localPath: string, folderToken: string): string {
  const name = path.basename(localPath);
  const dir = path.dirname(localPath);
  // Use drive +import to convert a local file into a Feishu docx in the target folder
  const stdout = execSync(
    `${e2eConfig.larkExe} drive +import --file "${name}" --folder-token "${folderToken}" --type "docx"`,
    { encoding: 'utf-8', timeout: 30000, cwd: dir },
  ) as unknown as string;
  // The output may contain progress messages before the final JSON.
  // Search for the last JSON object containing a file_token.
  const lines = stdout.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      const token = parsed.data?.file_token
        || parsed.data?.fileToken
        || parsed.data?.import_task?.file_token
        || parsed.data?.import_task?.fileToken
        || parsed.data?.task?.file_token;
      if (token) return token;
    } catch {}
  }
  throw new Error(`importDocx: could not find file_token in response:\n${stdout.slice(0, 500)}`);
}
