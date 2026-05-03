# E2E CLI Testing Design

## Goal

End-to-end testing of Obsidian-Feishu sync using real CLI tools: Obsidian CLI (`obsidian`) to manipulate vault files, Lark CLI (`lark-cli`) to verify Drive state. The test script automatically orchestrates both sides and compares results, catching integration bugs that unit tests with mocks cannot detect.

## Architecture

```
tests/e2e/
├── sync-e2e.ts          # Main test script: scenario orchestration
├── obsidian-cli.ts      # Obsidian CLI wrapper (create/read/delete/move/rename)
├── feishu-verifier.ts   # Lark CLI wrapper (list-files/download/check-exists)
└── e2e.config.ts        # Config (vault name, folder token, timeouts, test path)
```

**Components:**

- **`obsidian-cli.ts`** — Wraps `obsidian <cmd>` shell calls, returns structured results. Each command fires a blocking shell execution.
- **`feishu-verifier.ts`** — Wraps `lark-cli drive` query commands, provides `fileExists(name)`, `getFileContent(token)`, `fileTree()` verification methods.
- **`sync-e2e.ts`** — Uses both modules to orchestrate test scenarios: cleanup → arrange → wait → verify → cleanup. Each scenario is independent.
- **`e2e.config.ts`** — Centralized config: vault name, folder token, wait times, test path prefix.

## Test Scenarios

### Scenario 1: New file sync
- Obsidian: create `raw/test1.md`
- Wait 5s (debounce + sync)
- Lark: verify `test1.md` exists in `raw/` folder

### Scenario 2: Modified file sync
- Obsidian: append content to `raw/test1.md`
- Wait 5s
- Lark: download test1.md, verify content includes new lines

### Scenario 3: Delete file sync
- Obsidian: delete `raw/test1.md` permanently
- Wait 5s
- Lark: verify `test1.md` no longer exists in `raw/`

### Scenario 4: Move/rename file
- Obsidian: move `raw/test2.md` to `archive/test2.md`
- Wait 5s
- Lark: verify file absent from `raw/`, present in `archive/`

### Scenario 5: Nested folder auto-creation
- Obsidian: create `deep/nested/file.md`
- Wait 5s
- Lark: verify `deep/nested/file.md` exists, intermediate folders auto-created

### Scenario 6: Batch sync (syncAll)
- Obsidian: create `a.md`, `b.md`, `c.md`
- Wait 5s
- Lark: verify all three files exist

Each scenario cleans up test files on both ends before and after execution.

## Runtime Mechanism

**Prerequisites:**
- Obsidian running with `obsvault` vault open
- Plugin built and installed to vault `.obsidian/plugins/` directory
- Lark CLI authenticated (`lark-cli auth status` returns valid)
- Plugin settings configured with folder token

**Run:**
```
npm run test:e2e
```

**Per-scenario flow:**
1. `setup()` — Ensure test path is clean (delete test files on both ends)
2. `arrange()` — Create/modify/delete notes via Obsidian CLI
3. `wait()` — sleep 5s for plugin to detect changes and sync
4. `verify()` — Query Drive state via lark-cli, assert matches expected
5. `cleanup()` — Delete test files on both ends

**Key config (`e2e.config.ts`):**
- `vaultName`: "obsvault"
- `testPrefix`: "raw/" (all test files under this path)
- `debounceWaitMs`: 5000 (debounce 2s + sync time buffer)
- `folderToken`: from `FEISHU_FOLDER_TOKEN` env var (no hardcoded secrets)
- `obsidianExe`: "D:\\Tools\\Obsidian\\Obsidian.exe"
