import { describe, it, expect, vi, beforeEach } from 'vitest';
import child_process from 'child_process';

const mockExecSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ default: { execSync: mockExecSync }, execSync: mockExecSync }));

import { createFile, readFile, deleteFile, moveFile, renameFile, appendContent } from './obsidian-cli';

describe('obsidian-cli', () => {
  let execSync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    execSync = child_process.execSync as any;
  });

  describe('createFile', () => {
    it('constructs correct create command with name and content', () => {
      createFile({ name: 'test1.md', content: '# Hello', path: 'raw/' });
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('Obsidian.exe create'),
        expect.any(Object),
      );
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('name="test1.md"');
      expect(cmd).toContain('content="# Hello"');
      expect(cmd).toContain('path="raw/"');
    });

    it('omits path when not provided', () => {
      createFile({ name: 'note.md', content: 'text' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).not.toContain('path=');
    });
  });

  describe('readFile', () => {
    it('returns stdout from read command', () => {
      execSync.mockReturnValue('# Hello\n\nworld');
      const result = readFile({ file: 'raw/test1' });
      expect(result).toBe('# Hello\n\nworld');
      expect(execSync.mock.calls[0][0]).toContain('read file="raw/test1"');
    });
  });

  describe('deleteFile', () => {
    it('constructs delete command with permanent flag', () => {
      deleteFile({ file: 'raw/test1' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('delete file="raw/test1"');
      expect(cmd).toContain('permanent');
    });
  });

  describe('moveFile', () => {
    it('constructs move command with to path', () => {
      moveFile({ file: 'raw/test2', to: 'archive/' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('move file="raw/test2"');
      expect(cmd).toContain('to="archive/"');
    });
  });

  describe('renameFile', () => {
    it('constructs rename command with new name', () => {
      renameFile({ file: 'raw/test2', name: 'renamed' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('rename file="raw/test2"');
      expect(cmd).toContain('name="renamed"');
    });
  });

  describe('appendContent', () => {
    it('constructs append command with content', () => {
      appendContent({ file: 'raw/test1', content: 'new line' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('append file="raw/test1"');
      expect(cmd).toContain('content="new line"');
    });
  });
});
