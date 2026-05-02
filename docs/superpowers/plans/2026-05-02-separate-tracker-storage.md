# Separate Tracker Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate SyncStatusTracker storage from plugin settings, and add token validity guard in SyncEngine.

**Architecture:** Two independent fixes — SyncStatusTracker writes to `sync-state.json` instead of `data.json`, and SyncEngine treats falsy `feishuDocToken` as no-state (triggers create instead of update).

**Tech Stack:** TypeScript, Vitest, Node.js fs

---

### Task 1: SyncStatusTracker — separate storage file

**Files:**
- Modify: `src/sync/sync-status-tracker.ts:20`
- Modify: `src/sync/sync-status-tracker.test.ts:22,27`

- [ ] **Step 1: Write the failing test**

In `src/sync/sync-status-tracker.test.ts`, add this test after line 25 (after "loads empty state on corrupted JSON"):

```typescript
  it('writes to sync-state.json not data.json', () => {
    tracker.updateFileState('note.md', 'doc123', 1000);
    // data.json should NOT exist
    expect(fs.existsSync(path.join(testDir, 'data.json'))).toBe(false);
    // sync-state.json should exist
    expect(fs.existsSync(path.join(testDir, 'sync-state.json'))).toBe(true);
  });
```

Also update the existing "loads empty state on corrupted JSON" test (line 22): change `'data.json'` to `'sync-state.json'`:

```typescript
  it('loads empty state on corrupted JSON', () => {
    fs.writeFileSync(path.join(testDir, 'sync-state.json'), 'not json');
    tracker = new SyncStatusTracker(testDir);
    expect(tracker.getAllFiles()).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sync/sync-status-tracker.test.ts`
Expected: New test FAILS — `data.json` still exists, `sync-state.json` doesn't.

- [ ] **Step 3: Write minimal implementation**

In `src/sync/sync-status-tracker.ts`, change line 20:

```typescript
    this.dataPath = path.join(dataDir, 'sync-state.json');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sync/sync-status-tracker.test.ts`
Expected: 7 tests PASS (6 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add src/sync/sync-status-tracker.ts src/sync/sync-status-tracker.test.ts
git commit -m "fix: tracker writes to sync-state.json instead of data.json"
```

---

### Task 2: SyncEngine — token validity guard

**Files:**
- Modify: `src/sync/sync-engine.ts:62`
- Modify: `src/sync/sync-engine.test.ts` (new test)

- [ ] **Step 1: Write the failing test**

In `src/sync/sync-engine.test.ts`, add this test after line 104 (after "syncFile updates existing doc when state exists"):

```typescript
  it('syncFile creates new doc when state exists but feishuDocToken is empty', async () => {
    const mockFile = { path: 'note.md', name: 'note.md', extension: 'md', stat: { mtime: 1000 } } as any;
    deps.tracker.getFileState.mockReturnValue({ feishuDocToken: '' } as any);
    deps.resolver.resolve.mockReturnValue('needs-sync');
    mockVaultRead.mockResolvedValue('# Hello');
    deps.bridge.createDocument.mockResolvedValue({ documentId: 'doc2', url: '' });

    await engine.syncFile(mockFile);

    expect(deps.bridge.createDocument).toHaveBeenCalledWith('note', '# note\n\nprocessed', 'test-token');
    expect(deps.bridge.updateDocument).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sync/sync-engine.test.ts`
Expected: New test FAILS — `updateDocument` is called instead of `createDocument`.

- [ ] **Step 3: Write minimal implementation**

In `src/sync/sync-engine.ts`, change line 62:

```typescript
    if (!state || !state.feishuDocToken) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sync/sync-engine.test.ts`
Expected: 10 tests PASS (9 existing + 1 new)

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (95+)

- [ ] **Step 6: Commit**

```bash
git add src/sync/sync-engine.ts src/sync/sync-engine.test.ts
git commit -m "fix: treat empty feishuDocToken as no-state, route to create"
```
