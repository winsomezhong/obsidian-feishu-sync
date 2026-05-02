## 1. Project Scaffolding

- [ ] 1.1 Initialize TypeScript + Rollup project from Obsidian plugin template
- [ ] 1.2 Configure build scripts (npm run dev, npm run build)
- [ ] 1.3 Create `manifest.json` with plugin metadata (id: obsidian-feishu-sync, name: Obsidian Feishu Sync)
- [ ] 1.4 Create `main.ts` plugin entry point with `onload` / `onunload` lifecycle hooks
- [ ] 1.5 Install dev dependencies: obsidian types, esbuild/rollup, hot-reload plugin
- [ ] 1.6 Set up directory structure: `sync/`, `converter/`, `bridge/`, `ui/`

## 2. FeishuCliBridge — lark-cli Adapter

- [ ] 2.1 Create `bridge/feishu-cli-bridge.ts` with subprocess executor (child_process.exec wrapper, 30s timeout)
- [ ] 2.2 Implement `preflight()` — check lark-cli version and auth status
- [ ] 2.3 Implement `createDocument(title: string, content: string, folderToken: string)` — maps to `docs +create --api-version v2`
- [ ] 2.4 Implement `updateDocument(docToken: string, content: string)` — maps to `docs +update --api-version v2 --command overwrite`
- [ ] 2.5 Implement `deleteDocument(docToken: string)` — maps to `drive +delete --type docx`
- [ ] 2.6 Implement `fetchDocument(docToken: string)` — maps to `docs +fetch --api-version v2 --doc-format markdown`
- [ ] 2.7 Implement retry logic with exponential backoff (3s/10s/30s, max 3 retries)
- [ ] 2.8 Implement typed error classes: CliNotFoundError, AuthRequiredError, TimeoutError, ApiError, RateLimitError
- [ ] 2.9 Write unit tests for all bridge methods (mock subprocess)

## 3. SyncStatusTracker — State Persistence

- [ ] 3.1 Define `SyncState` and `FileSyncState` TypeScript interfaces
- [ ] 3.2 Create `sync/sync-status-tracker.ts` — load/save data.json from plugin data directory
- [ ] 3.3 Implement `updateFileState(path, docToken, mtime)` method
- [ ] 3.4 Implement `removeFileState(path)` method
- [ ] 3.5 Implement `getFileState(path): FileSyncState | null` method
- [ ] 3.6 Implement `getAllFiles(): FileSyncState[]` method for bulk operations
- [ ] 3.7 Handle corrupted data.json — initialize empty state on parse failure
- [ ] 3.8 Write unit tests for state persistence operations

## 4. ConflictResolver — Change Detection

- [ ] 4.1 Create `sync/conflict-resolver.ts`
- [ ] 4.2 Implement `resolve(file: TFile, state: FileSyncState | null): 'needs-sync' | 'skip'` — compare mtime vs lastSyncedAt
- [ ] 4.3 Write unit tests: new file, unchanged file, modified file

## 5. MarkdownConverter — PreProcessor Pipeline

- [ ] 5.1 Create `converter/preprocessor.ts` with Pipeline orchestrator (sequential processor chain)
- [ ] 5.2 Define `SyncProcessor` interface and `ProcessResult` type
- [ ] 5.3 Implement `FrontmatterProcessor` — detect `---` block, strip/keep per config
- [ ] 5.4 Implement `WikilinkProcessor` — regex parse `[[target]]` / `[[target|text]]`, keep-text strategy
- [ ] 5.5 Implement `TagProcessor` — regex handle `#tag-name`, keep-inline / strip strategies
- [ ] 5.6 Implement `TableProcessor` — detect tables, split at maxRows threshold with header duplication
- [ ] 5.7 Implement `ImageProcessor` — detect `![[path]]` / `![](path)`, collect references or strip
- [ ] 5.8 Implement `DataviewProcessor` — detect ````dataview` / ````dataviewjs` blocks, comment-out / strip
- [ ] 5.9 Implement `CalloutProcessor` — convert Obsidian callouts (`> [!note]`) to Feishu-compatible blocks
- [ ] 5.10 Implement `MathProcessor` — pass `$...$` / `$$...$$` through unchanged
- [ ] 5.11 Create `converter/index.ts` facade — `process(content: string, config: ProcessorConfig): ProcessResult`
- [ ] 5.12 Write unit tests for each processor with sample Obsidian markdown input

## 6. SyncEngine — Core Orchestration

- [ ] 6.1 Create `sync/sync-engine.ts` — main orchestrator with start/stop lifecycle
- [ ] 6.2 Register metadataCache event listeners (modify, create, delete, rename) with 2000ms debounce
- [ ] 6.3 Implement `syncFile(file: TFile)` — full pipeline: resolve → preprocess → bridge → update state
- [ ] 6.4 Implement `syncAll()` — iterate vault .md files, skip unchanged, sync sequentially
- [ ] 6.5 Implement file deletion flow: detect delete → lookup docToken → drive +delete → remove from state
- [ ] 6.6 Implement rename flow: update path in state, no Feishu document change
- [ ] 6.7 Handle first-time sync: no existing docToken → docs +create → store new token
- [ ] 6.8 Handle incremental sync: existing docToken → docs +update --command overwrite
- [ ] 6.9 Wire preflight into startup — block sync if preflight fails
- [ ] 6.10 Write integration tests for sync file lifecycle (create → modify → delete)

## 7. Plugin UI — Obsidian Interface

- [ ] 7.1 Create `ui/settings-tab.ts` with Obsidian PluginSettingTab
- [ ] 7.2 Add settings fields: folder token input, processor strategy selectors, table max rows, sync-on-save toggle
- [ ] 7.3 Read/write settings to Obsidian plugin data store via Plugin.loadData()/saveData()
- [ ] 7.4 Create `ui/status-bar.ts` — register StatusBarItem with sync status display
- [ ] 7.5 Implement status bar updates: ready / syncing / error states
- [ ] 7.6 Implement click handler on status bar to show sync log
- [ ] 7.7 Register two command palette commands: "Sync current note" and "Sync all notes"
- [ ] 7.8 Implement sync notification via Obsidian Notice API (success/failure)

## 8. Integration & Polish

- [ ] 8.1 Wire all modules together in `main.ts`: SyncEngine + FeishuBridge + PluginUI
- [ ] 8.2 Handle plugin lifecycle: onload → preflight → start engine; onunload → stop engine
- [ ] 8.3 Implement manual injection of `# Title` as the first line for `docs +create` (v2 API requires title in content)
- [ ] 8.4 Add sync log data structure (in-memory array of recent sync events)
- [ ] 8.5 [MANUAL] End-to-end test: create .md file in Obsidian → verify Feishu doc appears with correct content (requires real Obsidian dev environment + authenticated lark-cli)
- [ ] 8.6 [MANUAL] End-to-end test: modify .md file → verify Feishu doc updates
- [ ] 8.7 [MANUAL] End-to-end test: delete .md file → verify Feishu doc is deleted
- [ ] 8.8 Create README with setup instructions (install lark-cli, auth login, configure plugin)
