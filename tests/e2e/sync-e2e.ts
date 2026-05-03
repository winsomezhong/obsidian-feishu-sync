#!/usr/bin/env npx tsx
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

/** Poll until a condition is met, with timeout */
async function poll(
  predicate: () => boolean,
  timeoutMs = 15000,
  intervalMs = 1000,
  label = '',
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`${label} — timed out after ${timeoutMs}ms`);
}

/** Poll for file existence on Drive */
async function waitForFile(folderToken: string, fileName: string, timeoutMs = 15000): Promise<void> {
  return poll(
    () => feishu.fileExists(folderToken, fileName),
    timeoutMs, 1000,
    `File "${fileName}" not found on Drive`,
  );
}

/** Poll for file deletion from Drive */
async function waitForFileGone(folderToken: string, fileName: string, timeoutMs = 15000): Promise<void> {
  return poll(
    () => !feishu.fileExists(folderToken, fileName),
    timeoutMs, 1000,
    `File "${fileName}" still exists on Drive`,
  );
}

/** Delete files from both Obsidian (CLI) and Drive */
async function ensureCleanState(...paths: string[]): Promise<void> {
  // Clean Obsidian side via filesystem (more reliable than CLI delete)
  for (const filePath of paths) {
    obsidian.deleteFileFs(filePath);
  }
  // Clean Drive side
  for (const filePath of paths) {
    const fileName = filePath.split('/').pop()!;
    const folder = filePath.replace(`/${fileName}`, '');
    const folderToken = resolveFolderToken(folder, false);
    if (folderToken) {
      const found = feishu.findFile(folderToken, fileName);
      if (found) {
        try { feishu.deleteFileByToken(found.token); } catch {}
      }
    }
  }
}

function resolveFolderToken(vaultPath: string, verbose = true): string | null {
  if (!vaultPath || vaultPath === TEST_PREFIX.replace(/\/$/, '')) {
    return FOLDER_TOKEN;
  }
  const segments = vaultPath.split('/').filter(Boolean);
  let currentToken: string | null = FOLDER_TOKEN;
  for (const seg of segments) {
    if (!currentToken) return null;
    const subfolderToken = feishu.findSubfolder(currentToken, seg);
    if (!subfolderToken) return null;
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
    const FILE = `${TEST_PREFIX}s1-test.md`;
    await ensureCleanState(FILE);
    obsidian.createFile({ name: 's1-test.md', content: '# Hello E2E', path: TEST_PREFIX });
    await sleep(WAIT); // initial debounce
    const folderToken = resolveFolderToken(TEST_PREFIX);
    assert(folderToken !== null, 'folder token resolved');
    await waitForFile(folderToken!, 's1-test.md');
    await ensureCleanState(FILE);
    await sleep(WAIT);
  });

  // Scenario 2: Modified file sync
  await runTest('S2: Modified file sync', async () => {
    const FILE = `${TEST_PREFIX}s2-test.md`;
    await ensureCleanState(FILE);
    obsidian.createFile({ name: 's2-test.md', content: '# Original', path: TEST_PREFIX });
    const folderToken = resolveFolderToken(TEST_PREFIX);
    assert(folderToken !== null, 'folder token resolved');
    await waitForFile(folderToken!, 's2-test.md');
    // Append via filesystem — triggers Obsidian modify → plugin re-syncs
    obsidian.appendContentFs(FILE, '\nappended line');
    await waitForFile(folderToken!, 's2-test.md');
    const file = feishu.findFile(folderToken!, 's2-test.md');
    assert(file !== null, 's2-test.md exists after modification');
    const content = feishu.getFileContent(file!.token);
    assert(content.includes('appended line'), 'content includes appended line');
    await ensureCleanState(FILE);
    await sleep(WAIT);
  });

  // Scenario 3: Delete file sync
  await runTest('S3: Delete file sync', async () => {
    const FILE = `${TEST_PREFIX}s3-test.md`;
    await ensureCleanState(FILE);
    obsidian.createFile({ name: 's3-test.md', content: '# Will be deleted', path: TEST_PREFIX });
    const folderToken = resolveFolderToken(TEST_PREFIX);
    assert(folderToken !== null, 'folder token resolved');
    await waitForFile(folderToken!, 's3-test.md');
    // Delete via filesystem — triggers Obsidian delete → plugin removes from Drive
    obsidian.deleteFileFs(FILE);
    await waitForFileGone(folderToken!, 's3-test.md');
    await ensureCleanState(FILE);
    await sleep(WAIT);
  });

  // Scenario 4: Delete + create (simulate move)
  await runTest('S4: File delete + create (simulate move)', async () => {
    const SRC = `${TEST_PREFIX}s4-test.md`;
    const DST = 'archive/s4-test.md';
    await ensureCleanState(SRC, DST);
    obsidian.createFile({ name: 's4-test.md', content: '# Move me', path: TEST_PREFIX });
    const srcFolder = resolveFolderToken(TEST_PREFIX);
    assert(srcFolder !== null, 'source folder token resolved');
    await waitForFile(srcFolder!, 's4-test.md');
    // Delete source — instead of fs.unlink (may EBUSY), use Obsidian CLI delete
    obsidian.deleteFile({ file: `${TEST_PREFIX}s4-test.md` });
    await waitForFileGone(srcFolder!, 's4-test.md');
    // Create in new location
    obsidian.createFile({ name: 's4-test.md', content: '# Moved content', path: 'archive/' });
    const dstFolder = resolveFolderToken('archive');
    assert(dstFolder !== null, 'archive/ folder resolved');
    await waitForFile(dstFolder!, 's4-test.md');
    await ensureCleanState(SRC, DST);
    await sleep(WAIT);
  });

  // Scenario 5: Nested folder auto-creation
  await runTest('S5: Nested folder auto-creation', async () => {
    const FILE = 'deep/nested/s5-file.md';
    await ensureCleanState(FILE);
    obsidian.createFile({ name: 's5-file.md', content: '# Deep', path: 'deep/nested/' });
    await sleep(WAIT);
    const deepFolder = feishu.findSubfolder(FOLDER_TOKEN, 'deep');
    assert(deepFolder !== null, 'deep/ folder exists');
    const nestedFolder = feishu.findSubfolder(deepFolder!, 'nested');
    assert(nestedFolder !== null, 'nested/ folder exists');
    assert(feishu.fileExists(nestedFolder!, 's5-file.md'), 's5-file.md exists in nested/');
    await ensureCleanState(FILE);
    await sleep(WAIT);
  });

  // Scenario 6: Batch sync
  await runTest('S6: Batch sync', async () => {
    const FILES = ['s6-a.md', 's6-b.md', 's6-c.md'].map(f => `${TEST_PREFIX}${f}`);
    await ensureCleanState(...FILES);
    obsidian.createFile({ name: 's6-a.md', content: 'A', path: TEST_PREFIX });
    obsidian.createFile({ name: 's6-b.md', content: 'B', path: TEST_PREFIX });
    obsidian.createFile({ name: 's6-c.md', content: 'C', path: TEST_PREFIX });
    await sleep(WAIT);
    const folderToken = resolveFolderToken(TEST_PREFIX);
    for (const f of ['s6-a.md', 's6-b.md', 's6-c.md']) {
      await waitForFile(folderToken!, f);
    }
    await ensureCleanState(...FILES);
  });

  console.log('\n=== E2E Complete ===');
}

main();
