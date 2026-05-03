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
  let currentToken: string | null = FOLDER_TOKEN;
  for (const seg of segments) {
    const subfolderToken = feishu.findSubfolder(currentToken!, seg);
    if (!subfolderToken) {
      currentToken = null;
      break;
    }
    currentToken = subfolderToken;
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

  // Scenario 6: Batch sync
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
