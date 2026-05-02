import { Plugin, Notice } from 'obsidian';
import { FeishuCliBridge } from './bridge/feishu-cli-bridge';
import { SyncStatusTracker } from './sync/sync-status-tracker';
import { ConflictResolver } from './sync/conflict-resolver';
import { SyncEngine } from './sync/sync-engine';
import { Preprocessor } from './converter/preprocessor';
import { SyncLog } from './sync/sync-log';
import { SyncSettingsTab, DEFAULT_SETTINGS } from './ui/settings-tab';
import { SyncStatusBar } from './ui/status-bar';
import type { SyncPluginSettings } from './ui/settings-tab';

export default class FeishuSyncPlugin extends Plugin {
  engine!: SyncEngine;
  bridge!: FeishuCliBridge;
  tracker!: SyncStatusTracker;
  syncLog!: SyncLog;
  settings!: SyncPluginSettings;
  statusBar!: SyncStatusBar;

  async onload() {
    console.log('Loading Feishu Sync plugin');

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    const dataDir = this.manifest.dir || (this.app.vault.configDir + '/plugins/obsidian-feishu-sync');

    this.syncLog = new SyncLog();

    this.bridge = new FeishuCliBridge();
    this.tracker = new SyncStatusTracker(dataDir);
    const resolver = new ConflictResolver();
    const preprocessor = new Preprocessor(this.settings.processorConfig);

    this.engine = new SyncEngine(this, this.bridge, this.tracker, resolver, preprocessor);

    // Preflight
    const preflightResult = await this.bridge.preflight();
    if (!preflightResult.success) {
      new Notice(`Feishu Sync: ${preflightResult.error}`, 5000);
    }

    // Settings tab
    this.addSettingTab(new SyncSettingsTab(this.app, this, (settings) => {
      this.settings = settings;
    }));

    // Status bar
    const statusBarItem = this.addStatusBarItem();
    this.statusBar = new SyncStatusBar(statusBarItem);
    this.statusBar.onClick(() => {
      const entries = this.syncLog.getAll();
      if (entries.length === 0) {
        new Notice('No sync events recorded');
      } else {
        new Notice(`Last sync: ${entries[0].filePath} — ${entries[0].status}`, 3000);
      }
    });

    // Commands
    this.addCommand({
      id: 'sync-current-note',
      name: 'Sync current note to Feishu',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') return false;
        if (!checking) {
          this.engine.syncFile(file).then(() => {
            new Notice(`Synced ${file.name} to Feishu`);
            this.syncLog.add({ timestamp: Date.now(), filePath: file.path, operation: 'update', status: 'success' });
          }).catch(err => {
            new Notice(`Failed to sync ${file.name}: ${err.message}`, 5000);
            this.syncLog.add({ timestamp: Date.now(), filePath: file.path, operation: 'error', status: 'failure', errorMessage: err.message });
          });
        }
        return true;
      },
    });

    this.addCommand({
      id: 'sync-all-notes',
      name: 'Sync all notes to Feishu',
      callback: async () => {
        this.statusBar.updateDisplay('syncing');
        new Notice('Syncing all notes...');
        try {
          await this.engine.syncAll();
          this.statusBar.updateDisplay('ready');
          new Notice('Sync complete');
        } catch (err) {
          this.statusBar.updateDisplay('error', 'Sync failed');
          new Notice(`Sync failed: ${(err as Error).message}`, 5000);
        }
      },
    });

    // Auto-start engine for event-driven sync
    if (this.settings.syncOnSave) {
      this.engine.start();
    }
  }

  async onunload() {
    console.log('Unloading Feishu Sync plugin');
    this.engine.stop();
  }
}
