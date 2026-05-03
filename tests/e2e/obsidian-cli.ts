import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { e2eConfig } from './e2e.config';

// --- Obsidian CLI wrappers (for create/read which work reliably) ---

function cmd(args: string): string {
  const exe = e2eConfig.obsidianExe;
  return execSync(`${exe} ${args}`, { encoding: 'utf-8', timeout: 10000 }) as unknown as string;
}

export interface CreateParams {
  name: string;
  content?: string;
  path?: string;
}

/** Create file via Obsidian CLI (reliable) */
export function createFile(params: CreateParams): void {
  let args = `create name="${params.name}"`;
  if (params.content) args += ` content="${params.content.replace(/\n/g, '\\n')}"`;
  if (params.path) args += ` path="${params.path}"`;
  cmd(args);
}

/** Read file via Obsidian CLI (reliable with path= including .md) */
export function readFile(params: { file: string }): string {
  const param = params.file.includes('/') ? 'path' : 'file';
  return cmd(`read ${param}="${params.file}"`);
}

/** Delete file from Obsidian CLI (use path= with .md extension) */
export function deleteFile(params: { file: string }): void {
  const param = params.file.includes('/') ? 'path' : 'file';
  cmd(`delete ${param}="${params.file}" permanent`);
}

/** Reload the obsidian-feishu-sync plugin via Obsidian CLI */
export function reloadPlugin(): void {
  cmd(`plugin id="obsidian-feishu-sync" reload`);
}

// --- Direct filesystem operations (reliably trigger Obsidian events) ---

function vaultFile(relative: string): string {
  return path.join(e2eConfig.vaultPath, relative.replace(/^\//, ''));
}

/** Write/overwrite file directly on filesystem — triggers Obsidian modify/create events */
export function writeFileFs(relative: string, content: string): void {
  const fullPath = vaultFile(relative);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

/** Append content to file directly on filesystem — triggers Obsidian modify event */
export function appendContentFs(relative: string, content: string): void {
  const fullPath = vaultFile(relative);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.appendFileSync(fullPath, content, 'utf-8');
}

/** Delete file directly on filesystem — triggers Obsidian delete event */
export function deleteFileFs(relative: string): void {
  const fullPath = vaultFile(relative);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}
