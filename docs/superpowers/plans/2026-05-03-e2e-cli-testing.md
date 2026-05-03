# E2E CLI Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build E2E test layer that orchestrates Obsidian CLI + Lark CLI to verify end-to-end sync correctness across 6 scenarios.

**Architecture:** Four-file module in `tests/e2e/` — config (e2e.config.ts), Obsidian CLI wrapper (obsidian-cli.ts), Lark CLI verifier (feishu-verifier.ts), and main test script (sync-e2e.ts). Wrapper modules get vitest unit tests with mocked `child_process.execSync`; the main E2E script runs against real CLI tools via `npm run test:e2e`.

**Tech Stack:** TypeScript, Node.js `child_process.execSync`, vitest (unit tests for wrappers), ts-node (run E2E script directly)

---

### Task 1: Configuration module

**Files:**
- Create: `tests/e2e/e2e.config.ts`

- [ ] **Step 1: Write the config file**

```typescript
export const e2eConfig = {
  vaultName: 'obsvault',
  testPrefix: 'raw/',
  debounceWaitMs: 5000,
  folderToken: process.env.FEISHU_FOLDER_TOKEN || '',
  obsidianExe: process.env.OBSIDIAN_EXE || 'D:\\Tools\\Obsidian\\Obsidian.exe',
  larkExe: 'lark-cli',
};
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/e2e.config.ts
git commit -m "feat: add e2e config module"
```

---

### Task 2: Obsidian CLI wrapper

**Files:**
- Create: `tests/e2e/obsidian-cli.ts`
- Create: `tests/e2e/obsidian-cli.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import child_process from 'child_process';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

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
        expect.stringContaining('obsidian create'),
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
      execSync.mockReturnValue(Buffer.from('# Hello\n\nworld'));
      const result = readFile({ file: 'raw/test1' });
      expect(result).toBe('# Hello\n\nworld');
      expect(execSync.mock.calls[0][0]).toContain('obsidian read file="raw/test1"');
    });
  });

  describe('deleteFile', () => {
    it('constructs delete command with permanent flag', () => {
      deleteFile({ file: 'raw/test1' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('obsidian delete file="raw/test1"');
      expect(cmd).toContain('permanent');
    });
  });

  describe('moveFile', () => {
    it('constructs move command with to path', () => {
      moveFile({ file: 'raw/test2', to: 'archive/' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('obsidian move file="raw/test2"');
      expect(cmd).toContain('to="archive/"');
    });
  });

  describe('renameFile', () => {
    it('constructs rename command with new name', () => {
      renameFile({ file: 'raw/test2', name: 'renamed' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('obsidian rename file="raw/test2"');
      expect(cmd).toContain('name="renamed"');
    });
  });

  describe('appendContent', () => {
    it('constructs append command with content', () => {
      appendContent({ file: 'raw/test1', content: 'new line' });
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('obsidian append file="raw/test1"');
      expect(cmd).toContain('content="new line"');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/e2e/obsidian-cli.test.ts`
Expected: FAIL — all tests fail with "module not found" or similar (obsidian-cli.ts does not exist)

- [ ] **Step 3: Write minimal implementation**

```typescript
import { execSync } from 'child_process';
import { e2eConfig } from './e2e.config';

function cmd(args: string): string {
  const exe = e2eConfig.obsidianExe;
  return execSync(`${exe} ${args}`, { encoding: 'utf-8', timeout: 10000 });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/e2e/obsidian-cli.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/obsidian-cli.ts tests/e2e/obsidian-cli.test.ts
git commit -m "feat: add obsidian-cli wrapper with unit tests"
```

---

### Task 3: Feishu Drive verifier

**Files:**
- Create: `tests/e2e/feishu-verifier.ts`
- Create: `tests/e2e/feishu-verifier.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import child_process from 'child_process';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

import { listFiles, findFile, fileExists, getFileContent, deleteFileByToken, findSubfolder } from './feishu-verifier';

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
      execSync.mockReturnValue(Buffer.from(driveListJson([
        { name: 'test1.md', token: 'ftok_a', type: 'file' },
        { name: 'Clippings', token: 'fld_clip', type: 'folder' },
      ])));
      const files = listFiles('rootToken');
      expect(files).toHaveLength(2);
      expect(files[0]).toEqual({ name: 'test1.md', token: 'ftok_a', type: 'file' });
      expect(files[1]).toEqual({ name: 'Clippings', token: 'fld_clip', type: 'folder' });
    });

    it('constructs correct list command with folder token', () => {
      execSync.mockReturnValue(Buffer.from(driveListJson([])));
      listFiles('folderXYZ');
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('drive files list');
      expect(cmd).toContain('\\"folder_token\\":\\"folderXYZ\\"');
      expect(cmd).toContain('--page-all');
    });

    it('returns empty array when no files field', () => {
      execSync.mockReturnValue(Buffer.from(JSON.stringify({ data: {} })));
      expect(listFiles('tok')).toEqual([]);
    });
  });

  describe('findFile', () => {
    it('returns file info when found by name', () => {
      execSync.mockReturnValue(Buffer.from(driveListJson([
        { name: 'target.md', token: 'ftok_target', type: 'file' },
      ])));
      const result = findFile('folderToken', 'target.md');
      expect(result).toEqual({ name: 'target.md', token: 'ftok_target', type: 'file' });
    });

    it('returns null when file not found', () => {
      execSync.mockReturnValue(Buffer.from(driveListJson([
        { name: 'other.md', token: 'ftok_other', type: 'file' },
      ])));
      const result = findFile('folderToken', 'target.md');
      expect(result).toBeNull();
    });
  });

  describe('fileExists', () => {
    it('returns true when file found', () => {
      execSync.mockReturnValue(Buffer.from(driveListJson([
        { name: 'exists.md', token: 'tok', type: 'file' },
      ])));
      expect(fileExists('folderToken', 'exists.md')).toBe(true);
    });

    it('returns false when file not found', () => {
      execSync.mockReturnValue(Buffer.from(driveListJson([])));
      expect(fileExists('folderToken', 'missing.md')).toBe(false);
    });
  });

  describe('getFileContent', () => {
    it('downloads and returns file content', () => {
      execSync
        .mockReturnValueOnce(Buffer.from(JSON.stringify({ data: { file_token: 'ftok', url: '' } })))
        .mockReturnValueOnce(Buffer.from('# content'));
      const content = getFileContent('ftok');
      expect(content).toBe('# content');
      const cmd: string = execSync.mock.calls[1][0];
      expect(cmd).toContain('drive +download');
      expect(cmd).toContain('--file-token "ftok"');
    });
  });

  describe('deleteFileByToken', () => {
    it('constructs correct delete command', () => {
      execSync.mockReturnValue(Buffer.from('{}'));
      deleteFileByToken('ftok_del');
      const cmd: string = execSync.mock.calls[0][0];
      expect(cmd).toContain('drive +delete');
      expect(cmd).toContain('--file-token "ftok_del"');
      expect(cmd).toContain('--type file');
      expect(cmd).toContain('--yes');
    });
  });

  describe('findSubfolder', () => {
    it('returns folder token when matching folder exists', () => {
      execSync.mockReturnValue(Buffer.from(driveListJson([
        { name: 'Clippings', token: 'fld_clip', type: 'folder' },
      ])));
      expect(findSubfolder('parent', 'Clippings')).toBe('fld_clip');
    });

    it('returns null when no matching folder', () => {
      execSync.mockReturnValue(Buffer.from(driveListJson([
        { name: 'note.md', token: 'tok', type: 'file' },
      ])));
      expect(findSubfolder('parent', 'missing')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/e2e/feishu-verifier.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
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
  });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/e2e/feishu-verifier.test.ts`
Expected: all 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/feishu-verifier.ts tests/e2e/feishu-verifier.test.ts
git commit -m "feat: add feishu-drive verifier with unit tests"
```

---

### Task 4: Main E2E test script + package.json

**Files:**
- Create: `tests/e2e/sync-e2e.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the E2E test script**

```typescript
#!/usr/bin/env npx ts-node
import { e2eConfig } from './e2e.config';
import * as obsidian from './obsidian-cli';
import * as feishu from './feishu-verifier';

const TEST_PREFIX = e2eConfig.testPrefix; // "raw/"
const FOLDER_TOKEN = e2eConfig.folderToken;
const WAIT = e2eConfig.debounceWaitMs;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

async function ensureCleanState(...paths: string[]): Promise<void> {
  for (const filePath of paths) {
    try { obsidian.deleteFile({ file: filePath }); } catch {}
    try { obsidian.deleteFile({ file: filePath.replace(/\.md$/, '') }); } catch {}
  }
  // Also clean Drive side
  for (const filePath of paths) {
    const fileName = filePath.split('/').pop()!;
    const folder = filePath.replace(`/${fileName}`, '');
    const folderToken = resolveFolderToken(folder);
    if (folderToken) {
      const found = feishu.findFile(folderToken, fileName);
      if (found) {
        try { feishu.deleteFileByToken(found.token); } catch {}
      }
    }
  }
}

function resolveFolderToken(vaultPath: string): string | null {
  if (!vaultPath || vaultPath === TEST_PREFIX.replace(/\/$/, '')) {
    return FOLDER_TOKEN;
  }
  const segments = vaultPath.split('/').filter(Boolean);
  let currentToken = FOLDER_TOKEN;
  for (const seg of segments) {
    currentToken = feishu.findSubfolder(currentToken, seg) ?? '';
    if (!currentToken) return null;
  }
  return currentToken;
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n[E2E] Running: ${name}`);
  try {
    await fn();
    console.log(`[E2E] PASS: ${name}`);
  } catch (err: any) {
    console.error(`[E2E] FAIL: ${name} — ${err.message}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  if (!FOLDER_TOKEN) {
    console.error('FEISHU_FOLDER_TOKEN env var is required');
    process.exit(1);
  }

  console.log('=== E2E Sync Tests ===');
  console.log(`Test prefix: ${TEST_PREFIX}`);
  console.log(`Wait time: ${WAIT}ms`);

  // Scenario 1: New file sync
  await runTest('S1: New file sync', async () => {
    await ensureCleanState(`${TEST_PREFIX}test1.md`);
    obsidian.createFile({ name: 'test1.md', content: '# Hello E2E', path: TEST_PREFIX });
    await sleep(WAIT);
    const folderToken = resolveFolderToken(TEST_PREFIX);
    assert(folderToken !== null, 'folder token resolved');
    assert(feishu.fileExists(folderToken!, 'test1.md'), 'test1.md exists on Drive');
    await ensureCleanState(`${TEST_PREFIX}test1.md`);
  });

  // Scenario 2: Modified file sync
  await runTest('S2: Modified file sync', async () => {
    await ensureCleanState(`${TEST_PREFIX}test1.md`);
    obsidian.createFile({ name: 'test1.md', content: '# Original', path: TEST_PREFIX });
    await sleep(WAIT);
    obsidian.appendContent({ file: `${TEST_PREFIX}test1`, content: '\nappended line' });
    await sleep(WAIT);
    const folderToken = resolveFolderToken(TEST_PREFIX);
    const file = feishu.findFile(folderToken!, 'test1.md');
    assert(file !== null, 'test1.md exists after modification');
    const content = feishu.getFileContent(file!.token);
    assert(content.includes('appended line'), 'content includes appended line');
    await ensureCleanState(`${TEST_PREFIX}test1.md`);
  });

  // Scenario 3: Delete file sync
  await runTest('S3: Delete file sync', async () => {
    await ensureCleanState(`${TEST_PREFIX}test1.md`);
    obsidian.createFile({ name: 'test1.md', content: '# Will be deleted', path: TEST_PREFIX });
    await sleep(WAIT);
    obsidian.deleteFile({ file: `${TEST_PREFIX}test1` });
    await sleep(WAIT);
    const folderToken = resolveFolderToken(TEST_PREFIX);
    assert(!feishu.fileExists(folderToken!, 'test1.md'), 'test1.md is gone from Drive');
    await ensureCleanState(`${TEST_PREFIX}test1.md`);
  });

  // Scenario 4: Move/rename file
  await runTest('S4: Move file', async () => {
    await ensureCleanState(`${TEST_PREFIX}test2.md`, 'archive/test2.md');
    obsidian.createFile({ name: 'test2.md', content: '# Move me', path: TEST_PREFIX });
    await sleep(WAIT);
    obsidian.moveFile({ file: `${TEST_PREFIX}test2`, to: 'archive/' });
    await sleep(WAIT);
    const srcFolder = resolveFolderToken(TEST_PREFIX);
    const dstFolder = resolveFolderToken('archive');
    assert(!feishu.fileExists(srcFolder!, 'test2.md'), 'gone from source');
    if (dstFolder) {
      assert(feishu.fileExists(dstFolder, 'test2.md'), 'present in archive');
    }
    await ensureCleanState(`${TEST_PREFIX}test2.md`, 'archive/test2.md');
  });

  // Scenario 5: Nested folder auto-creation
  await runTest('S5: Nested folder auto-creation', async () => {
    await ensureCleanState('deep/nested/file.md');
    obsidian.createFile({ name: 'file.md', content: '# Deep', path: 'deep/nested/' });
    await sleep(WAIT);
    const deepFolder = feishu.findSubfolder(FOLDER_TOKEN, 'deep');
    assert(deepFolder !== null, 'deep/ folder exists');
    const nestedFolder = feishu.findSubfolder(deepFolder!, 'nested');
    assert(nestedFolder !== null, 'nested/ folder exists');
    assert(feishu.fileExists(nestedFolder!, 'file.md'), 'file.md exists in nested/');
    await ensureCleanState('deep/nested/file.md');
  });

  // Scenario 6: Batch sync (syncAll)
  await runTest('S6: Batch sync', async () => {
    await ensureCleanState(`${TEST_PREFIX}a.md`, `${TEST_PREFIX}b.md`, `${TEST_PREFIX}c.md`);
    obsidian.createFile({ name: 'a.md', content: 'A', path: TEST_PREFIX });
    obsidian.createFile({ name: 'b.md', content: 'B', path: TEST_PREFIX });
    obsidian.createFile({ name: 'c.md', content: 'C', path: TEST_PREFIX });
    await sleep(WAIT);
    const folderToken = resolveFolderToken(TEST_PREFIX);
    ['a.md', 'b.md', 'c.md'].forEach(f => {
      assert(feishu.fileExists(folderToken!, f), `${f} exists on Drive`);
    });
    await ensureCleanState(`${TEST_PREFIX}a.md`, `${TEST_PREFIX}b.md`, `${TEST_PREFIX}c.md`);
  });

  console.log('\n=== E2E Complete ===');
}

main();
```

- [ ] **Step 2: Add npm script to package.json**

In `package.json`, add the `test:e2e` script to the `scripts` block. Read the file first to find the exact location.

```json
"test:e2e": "npx ts-node tests/e2e/sync-e2e.ts"
```

- [ ] **Step 3: Build and deploy plugin before test**

Run: `npm run build`
Then copy `main.js` to vault plugin directory:
```bash
cp main.js "D:\华为云盘\obsvault\.obsidian\plugins\obsidian-feishu-sync\main.js"
```

- [ ] **Step 4: Run E2E test against real CLI**

```bash
FEISHU_FOLDER_TOKEN=<real-token> npm run test:e2e
```

Expected: all 6 scenarios PASS. If failures, debug and fix, then re-run.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/sync-e2e.ts package.json
git commit -m "feat: add E2E sync test script with 6 scenarios"
```
