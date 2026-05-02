## ADDED Requirements

### Requirement: FeishuCliBridge SHALL execute lark-cli commands via subprocess
The FeishuCliBridge SHALL wrap `child_process.exec()` calls to lark-cli, providing typed methods for document CRUD operations.

#### Scenario: Execute command successfully
- **WHEN** executing a lark-cli command
- **AND** the subprocess exits with code 0
- **THEN** FeishuCliBridge SHALL parse stdout as JSON
- **AND** return the parsed result to the caller

#### Scenario: Execute command with error
- **WHEN** executing a lark-cli command
- **AND** the subprocess exits with non-zero code
- **THEN** FeishuCliBridge SHALL parse stderr for error details
- **AND** throw a typed error with code and message

#### Scenario: Command timeout
- **WHEN** a lark-cli command does not complete within 30 seconds
- **THEN** FeishuCliBridge SHALL kill the subprocess
- **AND** throw a timeout error

### Requirement: FeishuCliBridge SHALL support document creation
The FeishuCliBridge SHALL provide a `createDocument(title, content, folderToken)` method.

#### Scenario: Create document from markdown
- **WHEN** `createDocument()` is called with title, markdown content, and folder token
- **THEN** FeishuCliBridge SHALL execute: `lark-cli docs +create --api-version v2 --content @- --doc-format markdown --parent-token <folderToken>`
- **AND** return the document_id and URL from the response

### Requirement: FeishuCliBridge SHALL support document full content update
The FeishuCliBridge SHALL provide an `updateDocument(docToken, content)` method that overwrites the entire document content.

#### Scenario: Overwrite document content
- **WHEN** `updateDocument()` is called with a doc token and new markdown content
- **THEN** FeishuCliBridge SHALL execute: `lark-cli docs +update --api-version v2 --doc <docToken> --content @- --doc-format markdown --command overwrite`
- **AND** the document SHALL contain only the new content after completion

### Requirement: FeishuCliBridge SHALL support document deletion
The FeishuCliBridge SHALL provide a `deleteDocument(docToken)` method.

#### Scenario: Delete Feishu document
- **WHEN** `deleteDocument()` is called with a valid doc token
- **THEN** FeishuCliBridge SHALL execute: `lark-cli drive +delete --file-token <docToken> --type docx --yes`

### Requirement: FeishuCliBridge SHALL support document content retrieval
The FeishuCliBridge SHALL provide a `fetchDocument(docToken)` method returning markdown content (for future v2 reverse sync).

#### Scenario: Fetch document as markdown
- **WHEN** `fetchDocument()` is called with a valid doc token
- **THEN** FeishuCliBridge SHALL execute: `lark-cli docs +fetch --api-version v2 --doc <docToken> --doc-format markdown`
- **AND** return the document content as a markdown string

### Requirement: FeishuCliBridge SHALL perform a connectivity preflight check
The FeishuCliBridge SHALL provide a `preflight()` method to verify lark-cli is installed and authenticated.

#### Scenario: Preflight passes
- **WHEN** `preflight()` is called
- **AND** `lark-cli --version` succeeds
- **AND** `lark-cli auth status` returns a ready token
- **THEN** FeishuCliBridge SHALL return a success result

#### Scenario: Preflight fails - CLI not installed
- **WHEN** `preflight()` is called
- **AND** `lark-cli` is not found in PATH
- **THEN** FeishuCliBridge SHALL return a failure with error code "CLI_NOT_FOUND"

#### Scenario: Preflight fails - not authenticated
- **WHEN** `preflight()` is called
- **AND** `lark-cli auth status` indicates a non-ready token
- **THEN** FeishuCliBridge SHALL return a failure with error code "AUTH_REQUIRED"

### Requirement: FeishuCliBridge SHALL implement retry with exponential backoff
The FeishuCliBridge SHALL retry failed commands up to 3 times with exponential backoff (3s, 10s, 30s) for transient errors.

#### Scenario: Retry on transient error
- **WHEN** a lark-cli command fails with a rate limit or network error
- **THEN** FeishuCliBridge SHALL wait 3 seconds and retry
- **AND** if it fails again, wait 10 seconds and retry
- **AND** if it fails again, wait 30 seconds and retry
- **AND** if all 3 retries fail, throw a permanent failure error

#### Scenario: No retry on fatal error
- **WHEN** a lark-cli command fails with "permission denied" or "not found"
- **THEN** FeishuCliBridge SHALL NOT retry
- **AND** throw immediately with the error code
