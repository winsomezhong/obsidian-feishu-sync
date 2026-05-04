import { Plugin, Notice } from 'obsidian';
import { FeishuCliBridge } from './bridge/feishu-cli-bridge';
import { SyncStatusTracker } from './sync/sync-status-tracker';
import { ConflictResolver } from './sync/conflict-resolver';
import { SyncEngine } from './sync/sync-engine';
import { SyncNotifier } from './sync/sync-notifier';
import { PullService } from './sync/pull-service';
import { OnlineDocConverter } from './sync/online-doc-converter';

import { SyncLog } from './sync/sync-log';
import { SyncSettingsTab, DEFAULT_SETTINGS } from './ui/settings-tab';
import { SyncStatusBar } from './ui/status-bar';
import type { SyncPluginSettings } from './ui/settings-tab';
import type { PreflightResult } from './types';
import { preflightResultToSettings } from './preflight-utils';

export default class FeishuSyncPlugin extends Plugin {
  engine!: SyncEngine;
  bridge!: FeishuCliBridge;
  tracker!: SyncStatusTracker;
  syncLog!: SyncLog;
  settings!: SyncPluginSettings;
  statusBar!: SyncStatusBar;
  pullService!: PullService;
  private autoSyncBatch: Array<{ path: string; success: boolean; error?: Error }> = [];
  private autoSyncTimer: ReturnType<typeof setTimeout> | null = null;

  private flushAutoSyncNotices(): void {
    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    const batch = this.autoSyncBatch;
    this.autoSyncBatch = [];
    if (batch.length === 0) return;
    const successCount = batch.filter(r => r.success).length;
    const failCount = batch.filter(r => !r.success).length;
    const errors = batch.filter(r => !r.success).map(r => ({ path: r.path, error: r.error! }));
    SyncNotifier.notifyBatch(successCount, failCount, errors.length > 0 ? errors : undefined);
  }

  private onAutoSyncResult(result: { path: string; success: boolean; error?: Error }): void {
    this.autoSyncBatch.push(result);
    if (this.autoSyncTimer) clearTimeout(this.autoSyncTimer);
    this.autoSyncTimer = setTimeout(() => this.flushAutoSyncNotices(), 3000);
  }

  async onload() {
    console.log('Loading Feishu Sync plugin');

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Legacy migration: use old folderToken directly as resolved token
    if ((this.settings as any).folderToken && !this.settings.folderPath && !this.settings.resolvedFolderToken) {
      this.settings.resolvedFolderToken = (this.settings as any).folderToken;
      this.settings.folderPath = '(migrated from folderToken)';
      delete (this.settings as any).folderToken;
      await this.saveData(this.settings);
    }

    const dataDir = this.manifest.dir || (this.app.vault.configDir + '/plugins/obsidian-feishu-sync');

    this.syncLog = new SyncLog();

    this.bridge = new FeishuCliBridge();
    this.tracker = new SyncStatusTracker(dataDir);
    const resolver = new ConflictResolver();
    const converter = new OnlineDocConverter(this.bridge);

    this.pullService = new PullService(
      this,
      this.bridge,
      this.tracker,
      resolver,
      converter,
      () => this.settings,
      () => this.settings.resolvedFolderToken,
    );

    this.engine = new SyncEngine(
      this,
      this.bridge,
      this.tracker,
      resolver,
      () => this.settings.folderPath,
      (path: string) => this.bridge.resolveFolderToken(path),
      (result) => this.onAutoSyncResult(result),
    );

    // Preflight (now includes folder path resolution)
    let preflightResult: PreflightResult;
    try {
      preflightResult = await this.bridge.preflight();
    } catch (err) {
      preflightResult = { success: false, error: `Preflight error: ${(err as Error).message}`, errorCode: 'PREFLIGHT_CRASHED' };
    }
    // Persist preflight result to settings
    const preflightSettings = preflightResultToSettings(preflightResult);
    this.settings.cliVersion = preflightSettings.cliVersion;
    this.settings.lastPreflightStatus = preflightSettings.lastPreflightStatus;
    this.settings.lastPreflightTime = preflightSettings.lastPreflightTime;
    await this.saveData(this.settings);
    if (!preflightResult.success) {
      this.settings.folderResolutionError = preflightResult.error || 'Preflight failed';
      await this.saveData(this.settings);
      // Enhanced auth expiry notice (8s) guiding user to settings tab
      if (preflightResult.errorCode === 'AUTH_REQUIRED') {
        new Notice('Feishu Sync: Auth not ready. Go to Settings -> Feishu Sync to re-authorize.', 8000);
      } else {
        new Notice(`Feishu Sync: ${preflightResult.error}`, 5000);
      }
    } else if (this.settings.folderPath) {
      // Resolve folder path during preflight and cache result
      try {
        const resolvedToken = await this.bridge.resolveFolderToken(this.settings.folderPath);
        this.settings.resolvedFolderToken = resolvedToken;
        this.settings.folderResolutionError = '';
        await this.saveData(this.settings);
      } catch (err) {
        this.settings.folderResolutionError = (err as Error).message;
        await this.saveData(this.settings);
        new Notice(
          `Feishu Sync: Failed to resolve folder path "${this.settings.folderPath}": ${(err as Error).message}`,
          5000,
        );
      }
    }

    // Settings tab
    this.addSettingTab(new SyncSettingsTab(this.app, this, (settings) => {
      this.settings = settings;
    }, async () => {
      let refreshResult: PreflightResult;
      try {
        refreshResult = await this.bridge.preflight();
      } catch (err) {
        refreshResult = { success: false, error: `Preflight error: ${(err as Error).message}`, errorCode: 'PREFLIGHT_CRASHED' };
      }
      const preflightSettings = preflightResultToSettings(refreshResult);
      this.settings.cliVersion = preflightSettings.cliVersion;
      this.settings.lastPreflightStatus = preflightSettings.lastPreflightStatus;
      this.settings.lastPreflightTime = preflightSettings.lastPreflightTime;
      if (!refreshResult.success) {
        this.settings.folderResolutionError = refreshResult.error || 'Preflight failed';
      } else if (this.settings.folderPath) {
        try {
          const resolvedToken = await this.bridge.resolveFolderToken(this.settings.folderPath);
          this.settings.resolvedFolderToken = resolvedToken;
          this.settings.folderResolutionError = '';
        } catch (err) {
          this.settings.resolvedFolderToken = '';
          this.settings.folderResolutionError = (err as Error).message;
        }
      }
      await this.saveData(this.settings);
      // The settings tab display() will re-run via the refresh callback
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
            SyncNotifier.notifySingle(file.name, true);
            this.syncLog.add({ timestamp: Date.now(), filePath: file.path, operation: 'update', status: 'success' });
          }).catch(err => {
            SyncNotifier.notifySingle(file.name, false, err.message);
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
          const result = await this.engine.syncAll();
          this.statusBar.updateDisplay('ready');
          SyncNotifier.notifyBatch(result.successCount, result.failCount, result.errors.length > 0 ? result.errors : undefined);
        } catch (err) {
          this.statusBar.updateDisplay('error', 'Sync failed');
          SyncNotifier.notifySingle('all notes', false, (err as Error).message);
        }
      },
    });

    this.addCommand({
      id: 'pull-from-feishu',
      name: 'Pull from Feishu',
      callback: async () => {
        new Notice('Pulling from Feishu...');
        try {
          const result = await this.pullService.pullAll();
          const total = result.successCount + result.failCount;
          if (total === 0) {
            new Notice('No files to pull from Feishu', 3000);
          } else {
            const msg = `Pulled ${result.successCount} file(s) from Feishu` +
              (result.failCount > 0 ? `, ${result.failCount} failed` : '') +
              (result.conflicts.length > 0 ? `, ${result.conflicts.length} conflict(s)` : '');
            new Notice(msg, 5000);
          }
        } catch (err) {
          new Notice(`Pull from Feishu failed: ${(err as Error).message}`, 8000);
        }
      },
    });

    // Auto-start engine for event-driven sync (only if preflight passed)
    if (this.settings.syncOnSave && preflightResult.success) {
      this.engine.start();
    }

    // Auto-start pull service (only if preflight passed)
    if (this.settings.pullEnabled && preflightResult.success) {
      this.pullService.start();
    }
  }

  async onunload() {
    console.log('Unloading Feishu Sync plugin');
    this.engine.stop();
    this.pullService.stop();
    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }
}
