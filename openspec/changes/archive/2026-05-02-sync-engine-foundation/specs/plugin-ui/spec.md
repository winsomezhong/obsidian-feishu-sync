## ADDED Requirements

### Requirement: PluginUI SHALL provide a settings tab
The PluginUI SHALL register an Obsidian settings tab with the plugin's configuration options.

#### Scenario: Settings tab loads with default values
- **WHEN** user opens Obsidian Settings → Community Plugins → Obsidian Feishu Sync
- **THEN** the settings tab SHALL display:
  - Folder token input (text field for Feishu Drive folder token)
  - Frontmatter strategy selector (dropdown: strip / keep-as-text)
  - Wikilink strategy selector (dropdown: keep-text / strip / to-url)
  - Tag strategy selector (dropdown: keep-inline / strip)
  - Dataview strategy selector (dropdown: comment-out / strip)
  - Image strategy selector (dropdown: upload / strip)
  - Table max rows input (number, default 9)
  - Sync on save toggle (default: enabled)
  - Status display (preflight result: ready / warnings / errors)

#### Scenario: Settings persist after save
- **WHEN** user changes a setting value
- **THEN** the plugin SHALL persist the change to Obsidian's plugin data store immediately

### Requirement: PluginUI SHALL show a status bar indicator
The PluginUI SHALL display a persistent status bar item showing the sync status.

#### Scenario: Show ready status
- **WHEN** preflight passes and engine is idle
- **THEN** status bar SHALL show "FS Sync: ✓" or similar positive indicator

#### Scenario: Show error status
- **WHEN** preflight fails or last sync had errors
- **THEN** status bar SHALL show "FS Sync: ⚠" or similar warning indicator
- **AND** clicking the indicator SHALL show error details

#### Scenario: Show syncing status
- **WHEN** sync is in progress
- **THEN** status bar SHALL show "FS Sync: ⟳" with animated indicator

### Requirement: PluginUI SHALL show sync notifications
The PluginUI SHALL display Obsidian notices for sync events.

#### Scenario: Sync success notification
- **WHEN** a file syncs successfully
- **THEN** PluginUI SHALL show a notice: "Synced <filename> to Feishu"

#### Scenario: Sync error notification
- **WHEN** a file sync fails
- **THEN** PluginUI SHALL show a notice: "Failed to sync <filename>: <error message>"
- **AND** the notice SHALL include a retry action button

### Requirement: PluginUI SHALL register command palette commands
The PluginUI SHALL register two commands in Obsidian's command palette.

#### Scenario: Register sync commands
- **WHEN** the plugin loads
- **THEN** "Sync current note to Feishu" SHALL appear in the command palette
- **AND** "Sync all notes to Feishu" SHALL appear in the command palette

### Requirement: PluginUI SHALL provide a sync log panel
The PluginUI SHALL maintain an in-memory log of recent sync events and display them in a dedicated view.

#### Scenario: Log sync events
- **WHEN** any sync operation completes (success or failure)
- **THEN** PluginUI SHALL append an entry to the sync log with: timestamp, file path, operation type (create/update/delete), status (success/failure), and error message if failed
- **AND** the log SHALL retain at most 200 recent entries

#### Scenario: Open sync log panel
- **WHEN** user clicks the status bar indicator
- **THEN** PluginUI SHALL open a modal or panel displaying the sync log in reverse chronological order
- **AND** each entry SHALL show timestamp, filename, operation, and status icon

#### Scenario: Clear sync log
- **WHEN** user presses "Clear log" button in the sync log panel
- **THEN** PluginUI SHALL clear all in-memory log entries
- **AND** the panel SHALL display "No sync events" or similar empty state
