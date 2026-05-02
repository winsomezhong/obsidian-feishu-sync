# Obsidian Feishu Sync

Sync Obsidian notes to Feishu/Lark documents.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [lark-cli](https://www.npmjs.com/package/@larksuite/cli) >= 1.0.22

## Setup

1. Install lark-cli:
```bash
npm install -g @larksuite/cli
```

2. Authenticate with Feishu:
```bash
lark-cli auth login
```

3. Install the plugin in your Obsidian vault

4. Configure the plugin settings:
   - Folder token: The token of your Feishu Drive folder
   - Processor strategies per your preference

## Usage

- **Sync on save**: Automatically syncs when a note is modified (default: enabled)
- **Command palette**: "Sync current note to Feishu" / "Sync all notes to Feishu"
- **Status bar**: Click to see last sync status

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
npm test       # run tests
```
