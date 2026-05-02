# Separate Tracker Storage

## Problem

`SyncStatusTracker` and Obsidian plugin settings share `data.json`, causing mutual overwrites. When tracker writes `{ files: {...} }`, it overwrites plugin settings (`folderToken`, `processorConfig`, `syncOnSave`). When settings save, it removes `files`. This also causes silent corruption: tracker loads settings JSON as its state, losing the `files` structure.

Additionally, `SyncEngine.syncFile` does not validate `feishuDocToken`. A state object with an empty/falsy token (e.g., from a prior bug) routes to the update path with `docID="undefined"`.

## Fix

### 1. Separate storage files

`SyncStatusTracker` writes to `sync-state.json` instead of `data.json`.

### 2. Token validity guard in syncFile

When `state.feishuDocToken` is falsy, treat as no state and create a new document (self-healing).

## Changes

| File | Change |
|------|--------|
| `src/sync/sync-status-tracker.ts` | `dataPath`: `data.json` → `sync-state.json` |
| `src/sync/sync-engine.ts` | `!state` → `!state \|\| !state.feishuDocToken` |
| `src/sync/sync-status-tracker.test.ts` | Verify tracker reads/writes `sync-state.json` |
| `src/sync/sync-engine.test.ts` | Test token falsy → create path |
