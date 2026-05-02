## ADDED Requirements

### Requirement: SyncEngine SHALL orchestrate the sync lifecycle
The SyncEngine SHALL coordinate the full sync pipeline: detect changes → resolve conflicts → preprocess content → write to Feishu → update state.

#### Scenario: Engine starts successfully
- **WHEN** Obsidian plugin loads
- **THEN** SyncEngine SHALL register event listeners on the metadataCache
- **AND** SyncEngine SHALL load existing SyncState from disk

#### Scenario: Engine stops gracefully
- **WHEN** Obsidian plugin unloads
- **THEN** SyncEngine SHALL unregister all event listeners
- **AND** SyncEngine SHALL persist current SyncState to disk

### Requirement: SyncEngine SHALL support manual sync triggers
The SyncEngine SHALL expose two commands in Obsidian's command palette: "Sync current note to Feishu" and "Sync all notes to Feishu".

#### Scenario: Sync single file via command
- **WHEN** user triggers "Sync current note to Feishu" in command palette
- **AND** the active file is a .md file
- **THEN** SyncEngine SHALL run the sync pipeline on that single file

#### Scenario: Sync all files via command
- **WHEN** user triggers "Sync all notes to Feishu" in command palette
- **THEN** SyncEngine SHALL iterate all .md files in the vault
- **AND** SyncEngine SHALL skip files whose mtime <= lastSyncedAt
- **AND** SyncEngine SHALL sync remaining files sequentially

#### Scenario: Sync all continues on individual failure
- **WHEN** user triggers "Sync all notes to Feishu"
- **AND** syncing one or more files fails
- **THEN** SyncEngine SHALL continue syncing remaining files
- **AND** SyncEngine SHALL collect all errors with file paths and error messages
- **AND** SyncEngine SHALL report a summary upon completion (success count, failure count, per-file error details)

### Requirement: SyncEngine SHALL detect file changes via Obsidian events
The SyncEngine SHALL listen to metadataCache events for modify, create, delete, and rename.

#### Scenario: Detect file modification
- **WHEN** user saves a .md file (metadataCache 'modify' event fires)
- **THEN** SyncEngine SHALL debounce the event for 2000ms
- **AND** SyncEngine SHALL check if file.stat.mtime > SyncState.lastSyncedAt
- **AND** if changed, SyncEngine SHALL run the sync pipeline for that file

#### Scenario: Detect file creation
- **WHEN** a new .md file is created in the vault (metadataCache 'create' event fires)
- **THEN** SyncEngine SHALL run the sync pipeline to create a new Feishu document

#### Scenario: Detect file deletion
- **WHEN** a .md file is deleted from the vault (metadataCache 'delete' event fires)
- **THEN** SyncEngine SHALL check if SyncState has a recorded Feishu docToken for that file
- **AND** if found, SyncEngine SHALL delete the corresponding Feishu document via feishu-bridge
- **AND** SyncEngine SHALL remove the entry from SyncState

#### Scenario: Detect file rename
- **WHEN** a .md file is renamed or moved (metadataCache 'rename' event fires)
- **THEN** SyncEngine SHALL update the file path in SyncState
- **AND** SyncEngine SHALL NOT create a new Feishu document
- **AND** if the new filename differs, SyncEngine SHALL update the Feishu document title to reflect the new filename

### Requirement: ConflictResolver SHALL use document-level timestamp comparison
The ConflictResolver SHALL determine whether a file needs syncing by comparing its mtime against the last successful sync timestamp.

#### Scenario: File is newer than last sync
- **WHEN** file.stat.mtime > SyncState.files[path].lastSyncedAt
- **THEN** ConflictResolver SHALL return "needs-sync"

#### Scenario: File has not changed since last sync
- **WHEN** file.stat.mtime <= SyncState.files[path].lastSyncedAt
- **THEN** ConflictResolver SHALL return "skip"

#### Scenario: File has never been synced
- **WHEN** no SyncState entry exists for the file path
- **THEN** ConflictResolver SHALL return "needs-sync"

### Requirement: SyncStatusTracker SHALL persist sync state to disk
The SyncStatusTracker SHALL maintain a JSON file (data.json) mapping local file paths to their Feishu document tokens and sync timestamps.

#### Scenario: Persist state after successful sync
- **WHEN** a file is successfully synced to Feishu
- **THEN** SyncStatusTracker SHALL record: localPath, feishuDocToken, lastSyncedAt, lastLocalMtime
- **AND** SyncStatusTracker SHALL write the updated state to data.json immediately

#### Scenario: Handle state persistence failure after Feishu creation
- **WHEN** createDocument succeeds but SyncStatusTracker fails to persist state to data.json
- **THEN** SyncEngine SHALL treat the entire sync operation as failed
- **AND** SyncEngine SHALL log a warning that the Feishu document may exist without local state
- **AND** on next sync attempt for the same file (no SyncState entry found), SyncEngine SHALL proceed with create (user may need to manually remove duplicate if one was already created)

#### Scenario: Load state on startup
- **WHEN** SyncEngine initializes
- **THEN** SyncStatusTracker SHALL read data.json from the plugin data directory
- **AND** if data.json is missing or corrupted, SyncStatusTracker SHALL initialize an empty state

#### Scenario: Remove state entry on file deletion
- **WHEN** a file is deleted from vault and Feishu document is removed
- **THEN** SyncStatusTracker SHALL remove the corresponding entry from SyncState
