import { describe, it, expect, vi, beforeEach } from 'vitest';
import child_process from 'child_process';

const mockExecSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ default: { execSync: mockExecSync }, execSync: mockExecSync }));

// Mock fs to avoid actual filesystem operations in unit tests
vi.mock('fs', () => ({ default: {}, }));
vi.mock('path', () => ({ default: { join: (...args: string[]) => args.join('/') }, join: (...args: string[]) => args.join('/') }));

import { createFile, readFile, deleteFile, reloadPlugin } from './obsidian-cli';

describe('obsidian-cli', () => {
  let execSync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    execSync = child_process.execSync as any;
  });

  describe('createFile', () => {
    it('constructs create command with name, content and path', () => {
      createFile({ name: 'test1.md', content: '# Hello', path: 'raw/' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('create name="test1.md"');
      expect(cmd).toContain('content="# Hello"');
      expect(cmd).toContain('path="raw/"');
    });

    it('omits path when not provided', () => {
      createFile({ name: 'note.md', content: 'text' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).not.toContain('path=');
    });

    it('escapes newlines in content', () => {
      createFile({ name: 'multi.md', content: 'line1\nline2' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('content="line1\\nline2"');
    });
  });

  describe('readFile', () => {
    it('uses path= param when file contains slash', () => {
      execSync.mockReturnValue('# content');
      const result = readFile({ file: 'raw/test1.md' });
      expect(result).toBe('# content');
      expect(execSync.mock.calls[0][0]).toContain('read path="raw/test1.md"');
    });

    it('uses file= param when no slash', () => {
      execSync.mockReturnValue('text');
      const result = readFile({ file: 'test1' });
      expect(result).toBe('text');
      expect(execSync.mock.calls[0][0]).toContain('read file="test1"');
    });
  });

  describe('deleteFile', () => {
    it('uses path= param with permanent flag', () => {
      deleteFile({ file: 'raw/test1.md' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('delete path="raw/test1.md"');
      expect(cmd).toContain('permanent');
    });
  });

  describe('reloadPlugin', () => {
    it('sends plugin reload command for obsidian-feishu-sync', () => {
      reloadPlugin();
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('plugin id="obsidian-feishu-sync" reload');
    });
  });
});
