#!/usr/bin/env npx tsx
import { e2eConfig } from './e2e.config';
import * as obsidian from './obsidian-cli';
import * as feishu from './feishu-verifier';

const TEST_PREFIX = e2eConfig.testPrefix; // "raw/"
const FOLDER_PATH = e2eConfig.folderPath;
const WAIT = e2eConfig.debounceWaitMs;

let CACHED_ROOT_TOKEN: string | null = null;

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

/** Resolve the root folder token from the configured folder path */
function getRootFolderToken(): string {
  if (CACHED_ROOT_TOKEN) return CACHED_ROOT_TOKEN;
  const token = feishu.resolveFolderPath(FOLDER_PATH);
  if (!token) throw new Error(`Cannot resolve folder path: "${FOLDER_PATH}"`);
  CACHED_ROOT_TOKEN = token;
  return token;
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
  const normalized = vaultPath.replace(/\/$/, '');
  if (!normalized) return getRootFolderToken();
  const segments = normalized.split('/').filter(Boolean);
  let currentToken: string | null = getRootFolderToken();
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
  if (!FOLDER_PATH) {
    console.error('FEISHU_FOLDER_PATH env var or folderPath config is required');
    process.exit(1);
  }

  console.log('=== E2E Sync Tests ===');
  console.log(`Folder path: ${FOLDER_PATH}`);
  console.log(`Test prefix: ${TEST_PREFIX}`);
  console.log(`Wait time: ${WAIT}ms`);

  // Resolve root folder token early to fail fast
  let rootToken: string;
  try {
    rootToken = getRootFolderToken();
    console.log(`Root token resolved: ${rootToken}`);
  } catch (err: any) {
    console.error(`Cannot resolve folder path "${FOLDER_PATH}": ${err.message}`);
    process.exit(1);
  }

  // Pre-create test folders so resolution works for all scenarios
  for (const folder of ['_e2etest', 'archive']) {
    if (!feishu.findSubfolder(rootToken, folder)) {
      const created = feishu.createFolder(rootToken, folder);
      console.log(`Created test folder "${folder}": ${created}`);
    }
  }

  // Reload plugin to pick up latest code (replaces Obsidian restart)
  console.log('Reloading obsidian-feishu-sync plugin...');
  obsidian.reloadPlugin();
  console.log('Plugin reloaded.');

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
    // Wait for the Drive file content to include the appended text
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
    const deepFolder = feishu.findSubfolder(rootToken, 'deep');
    assert(deepFolder !== null, 'deep/ folder exists');
    const nestedFolder = feishu.findSubfolder(deepFolder!, 'nested');
    assert(nestedFolder !== null, 'nested/ folder exists');
    assert(feishu.fileExists(nestedFolder!, 's5-file.md'), 's5-file.md exists in nested/');
    await ensureCleanState(FILE);
    await sleep(WAIT);
  });

  // Scenario 6: Batch sync (stagger creation to avoid API contention)
  await runTest('S6: Batch sync', async () => {
    const FILES = ['s6-a.md', 's6-b.md', 's6-c.md'].map(f => `${TEST_PREFIX}${f}`);
    await ensureCleanState(...FILES);
    obsidian.createFile({ name: 's6-a.md', content: 'A', path: TEST_PREFIX });
    await sleep(3000);
    obsidian.createFile({ name: 's6-b.md', content: 'B', path: TEST_PREFIX });
    await sleep(3000);
    obsidian.createFile({ name: 's6-c.md', content: 'C', path: TEST_PREFIX });
    await sleep(WAIT);
    const folderToken = resolveFolderToken(TEST_PREFIX);
    for (const f of ['s6-a.md', 's6-b.md', 's6-c.md']) {
      await waitForFile(folderToken!, f, 60000);
    }
    await ensureCleanState(...FILES);
  });

  // Scenario 7: Re-sync after external Drive deletion (error 1061007 resilience)
  await runTest('S7: Re-sync after external Drive deletion', async () => {
    const FILE = `${TEST_PREFIX}s7-recover.md`;
    await ensureCleanState(FILE);

    // Step 1: Create and sync
    obsidian.createFile({ name: 's7-recover.md', content: '# Version 1', path: TEST_PREFIX });
    const folderToken = resolveFolderToken(TEST_PREFIX);
    assert(folderToken !== null, 'folder token resolved');
    await waitForFile(folderToken!, 's7-recover.md');

    // Step 2: Simulate external deletion — delete the Drive file directly via lark-cli, bypassing the plugin
    const driveFile = feishu.findFile(folderToken!, 's7-recover.md');
    assert(driveFile !== null, 'Drive file exists before external delete');
    feishu.deleteFileByToken(driveFile!.token);
    await waitForFileGone(folderToken!, 's7-recover.md');

    // Step 3: Modify local file to trigger re-sync.
    // The plugin will try to delete the old (already-gone) Drive token and MUST handle 1061007 gracefully,
    // then upload the new version.
    obsidian.appendContentFs(FILE, '\n# Version 2');

    // Step 4: Verify the file appears back on Drive with updated content
    await waitForContent(folderToken!, 's7-recover.md', 'Version 2');

    await ensureCleanState(FILE);
    await sleep(WAIT);
  });

  console.log('\n=== E2E Complete ===');
}

main();
