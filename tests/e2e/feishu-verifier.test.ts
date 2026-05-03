import { describe, it, expect, vi, beforeEach } from 'vitest';
import child_process from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mockExecSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ default: { execSync: mockExecSync }, execSync: mockExecSync }));

const mockMkdtempSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockRmSync = vi.hoisted(() => vi.fn());
vi.mock('fs', () => ({
  default: {
    mkdtempSync: mockMkdtempSync,
    readFileSync: mockReadFileSync,
    rmSync: mockRmSync,
  },
  mkdtempSync: mockMkdtempSync,
  readFileSync: mockReadFileSync,
  rmSync: mockRmSync,
}));

vi.mock('os', () => ({
  default: { tmpdir: () => '/tmp' },
  tmpdir: () => '/tmp',
}));

vi.mock('path', () => ({
  default: { join: (...args: string[]) => args.join('/') },
  join: (...args: string[]) => args.join('/'),
}));

import { listFiles, findFile, fileExists, getFileContent, deleteFileByToken, findSubfolder, resolveFolderPath } from './feishu-verifier';

function driveListJson(files: Array<{ name: string; token: string; type: string }>) {
  return JSON.stringify({ data: { files } });
}

describe('feishu-verifier', () => {
  let execSync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    execSync = child_process.execSync as any;
  });

  describe('listFiles', () => {
    it('parses file list from lark-cli output', () => {
      execSync.mockReturnValue(driveListJson([
        { name: 'test1.md', token: 'ftok_a', type: 'file' },
        { name: 'Clippings', token: 'fld_clip', type: 'folder' },
      ]));
      const files = listFiles('rootToken');
      expect(files).toHaveLength(2);
      expect(files[0]).toEqual({ name: 'test1.md', token: 'ftok_a', type: 'file' });
      expect(files[1]).toEqual({ name: 'Clippings', token: 'fld_clip', type: 'folder' });
    });

    it('constructs correct list command with folder token', () => {
      execSync.mockReturnValue(driveListJson([]));
      listFiles('folderXYZ');
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('drive files list');
      expect(cmd).toContain('\\"folder_token\\":\\"folderXYZ\\"');
      expect(cmd).toContain('--page-all');
    });

    it('returns empty array when no files field', () => {
      execSync.mockReturnValue(JSON.stringify({ data: {} }));
      expect(listFiles('tok')).toEqual([]);
    });
  });

  describe('findFile', () => {
    it('returns file info when found by name', () => {
      execSync.mockReturnValue(driveListJson([
        { name: 'target.md', token: 'ftok_target', type: 'file' },
      ]));
      const result = findFile('folderToken', 'target.md');
      expect(result).toEqual({ name: 'target.md', token: 'ftok_target', type: 'file' });
    });

    it('returns null when file not found', () => {
      execSync.mockReturnValue(driveListJson([
        { name: 'other.md', token: 'ftok_other', type: 'file' },
      ]));
      const result = findFile('folderToken', 'target.md');
      expect(result).toBeNull();
    });
  });

  describe('fileExists', () => {
    it('returns true when file found', () => {
      execSync.mockReturnValue(driveListJson([
        { name: 'exists.md', token: 'tok', type: 'file' },
      ]));
      expect(fileExists('folderToken', 'exists.md')).toBe(true);
    });

    it('returns false when file not found', () => {
      execSync.mockReturnValue(driveListJson([]));
      expect(fileExists('folderToken', 'missing.md')).toBe(false);
    });
  });

  describe('getFileContent', () => {
    it('downloads and returns file content', () => {
      mockMkdtempSync.mockReturnValue('/tmp/feishu-e2e-abc');
      execSync.mockReturnValue(JSON.stringify({ data: { file_token: 'ftok', url: '' } }));
      mockReadFileSync.mockReturnValue('# content');
      const content = getFileContent('ftok');
      expect(content).toBe('# content');
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('drive +download');
      expect(cmd).toContain('--file-token "ftok"');
      expect(cmd).toContain('--output');
    });
  });

  describe('deleteFileByToken', () => {
    it('constructs correct delete command', () => {
      execSync.mockReturnValue('{}');
      deleteFileByToken('ftok_del');
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('drive +delete');
      expect(cmd).toContain('--file-token "ftok_del"');
      expect(cmd).toContain('--type file');
      expect(cmd).toContain('--yes');
    });
  });

  describe('resolveFolderPath', () => {
    it('returns folder token for matching path', () => {
      execSync.mockReturnValue(JSON.stringify({
        data: {
          results: [{
            result_meta: { token: 'fld_root', doc_types: 'FOLDER', url: '/obsvault' },
            title_highlighted: 'obsvault',
          }],
        },
      }));
      expect(resolveFolderPath('/obsvault')).toBe('fld_root');
    });

    it('filters non-FOLDER results', () => {
      execSync.mockReturnValue(JSON.stringify({
        data: {
          results: [
            { result_meta: { token: 'ftok_x', doc_types: 'FILE', url: '/obsvault' } },
            { result_meta: { token: 'fld_root', doc_types: 'FOLDER', url: '/obsvault' } },
          ],
        },
      }));
      expect(resolveFolderPath('/obsvault')).toBe('fld_root');
    });

    it('returns null for empty results', () => {
      execSync.mockReturnValue(JSON.stringify({ data: { results: [] } }));
      expect(resolveFolderPath('/nonexistent')).toBeNull();
    });

    it('returns null for empty path', () => {
      expect(resolveFolderPath('')).toBeNull();
    });
  });

  describe('findSubfolder', () => {
    it('returns folder token when matching folder exists', () => {
      execSync.mockReturnValue(driveListJson([
        { name: 'Clippings', token: 'fld_clip', type: 'folder' },
      ]));
      expect(findSubfolder('parent', 'Clippings')).toBe('fld_clip');
    });

    it('returns null when no matching folder', () => {
      execSync.mockReturnValue(driveListJson([
        { name: 'note.md', token: 'tok', type: 'file' },
      ]));
      expect(findSubfolder('parent', 'missing')).toBeNull();
    });
  });
});
