#!/usr/bin/env npx tsx
import { e2eConfig } from './e2e.config';
import * as obsidian from './obsidian-cli';
import * as feishu from './feishu-verifier';

const TEST_PREFIX = e2eConfig.testPrefix; // "raw/"
const ROOT_FOLDER_TOKEN = feishu.getRootFolderToken();
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

/** Poll for file content on Drive to include expected text */
async function waitForContent(folderToken: string, fileName: string, expected: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const file = feishu.findFile(folderToken, fileName);
    if (file) {
      try {
        const content = feishu.getFileContent(file.token);
        if (content.includes(expected)) return;
      } catch {}
    }
    await sleep(1000);
  }
  throw new Error(`Content "${expected}" not found in "${fileName}" on Drive after ${timeoutMs}ms`);
}

/** Poll for file deletion from Drive */
async function waitForFileGone(folderToken: string, fileName: string, timeoutMs = 15000): Promise<void> {
  return poll(
    () => !feishu.fileExists(folderToken, fileName),
    timeoutMs, 1000,
    `File "${fileName}" still exists on Drive`,
  );
}

function resolveFolderToken(vaultPath: string): string | null {
  if (!vaultPath || vaultPath === TEST_PREFIX.replace(/\/$/, '')) {
    return ROOT_FOLDER_TOKEN;
  }
  const segments = vaultPath.split('/').filter(Boolean);
  let currentToken: string | null = ROOT_FOLDER_TOKEN;
  for (const seg of segments) {
    if (!currentToken) return null;
    const subfolderToken = feishu.findSubfolder(currentToken, seg);
    if (!subfolderToken) return null;
    currentToken = subfolderToken;
  }
  return currentToken;
}

/** Delete files from both Obsidian (CLI) and Drive */
async function ensureCleanState(...paths: string[]): Promise<void> {
  for (const filePath of paths) {
    obsidian.deleteFileFs(filePath);
  }
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
  const configFolderPath = e2eConfig.folderPath;
  const configFolderToken = e2eConfig.folderToken;

  console.log('=== E2E Sync Tests ===');
  console.log(`Test prefix: ${TEST_PREFIX}`);
  console.log(`Wait time: ${WAIT}ms`);
  if (configFolderPath) {
    console.log(`Folder path: ${configFolderPath}`);
  }
  console.log(`Root folder token: ${ROOT_FOLDER_TOKEN.slice(0, 8)}...`);

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
    obsidian.appendContentFs(FILE, '\nappended line');
    await waitForContent(folderToken!, 's2-test.md', 'appended line');
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
    obsidian.deleteFile({ file: `${TEST_PREFIX}s4-test.md` });
    await waitForFileGone(srcFolder!, 's4-test.md');
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
    const deepFolder = feishu.findSubfolder(ROOT_FOLDER_TOKEN, 'deep');
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
