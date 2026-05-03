import { execSync } from 'child_process';
import { e2eConfig } from './e2e.config';

function cmd(args: string): string {
  const exe = e2eConfig.obsidianExe;
  return execSync(`${exe} ${args}`, { encoding: 'utf-8', timeout: 10000 }) as unknown as string;
}

export interface CreateParams {
  name: string;
  content?: string;
  path?: string;
}

export function createFile(params: CreateParams): void {
  let args = `create name="${params.name}"`;
  if (params.content) args += ` content="${params.content}"`;
  if (params.path) args += ` path="${params.path}"`;
  cmd(args);
}

export function readFile(params: { file: string }): string {
  return cmd(`read file="${params.file}"`);
}

export function deleteFile(params: { file: string; permanent?: boolean }): void {
  let args = `delete file="${params.file}"`;
  if (params.permanent !== false) args += ' permanent';
  cmd(args);
}

export function moveFile(params: { file: string; to: string }): void {
  cmd(`move file="${params.file}" to="${params.to}"`);
}

export function renameFile(params: { file: string; name: string }): void {
  cmd(`rename file="${params.file}" name="${params.name}"`);
}

export function appendContent(params: { file: string; content: string }): void {
  cmd(`append file="${params.file}" content="${params.content}"`);
}
