import { App, PluginSettingTab, Setting } from 'obsidian';
import type { PreflightStatus } from '../types';

export interface SyncPluginSettings {
  folderPath: string;
  resolvedFolderToken: string;
  folderResolutionError: string;
  syncOnSave: boolean;
  cliVersion?: string;
  lastPreflightStatus?: PreflightStatus;
  lastPreflightTime?: number;
  language: 'en' | 'zh';
}

export const DEFAULT_SETTINGS: SyncPluginSettings = {
  folderPath: '',
  resolvedFolderToken: '',
  folderResolutionError: '',
  syncOnSave: true,
  cliVersion: undefined,
  lastPreflightStatus: undefined,
  lastPreflightTime: undefined,
  language: 'en',
};

export interface CliStatusDisplay {
  text: string;
  color: string;
}

export function getCliStatusDisplay(settings: SyncPluginSettings): CliStatusDisplay {
  if (!settings.lastPreflightStatus) {
    return { text: 'CLI: checking...', color: 'gray' };
  }
  if (settings.lastPreflightStatus === 'ok') {
    const version = settings.cliVersion ? ` v${settings.cliVersion}` : '';
    return { text: `CLI: lark-cli${version}`, color: 'green' };
  }
  if (settings.lastPreflightStatus === 'cli_not_found') {
    return { text: 'CLI: lark-cli not found', color: 'red' };
  }
  // For auth-related statuses, CLI was found but auth failed
  return { text: 'CLI: lark-cli', color: 'green' };
}

export interface AuthStatusDisplay {
  text: string;
  color: string;
}

export function getAuthStatusDisplay(settings: SyncPluginSettings): AuthStatusDisplay {
  if (!settings.lastPreflightStatus) {
    return { text: 'Auth: checking...', color: 'gray' };
  }
  switch (settings.lastPreflightStatus) {
    case 'ok':
      return { text: 'Auth: Authorized', color: 'green' };
    case 'auth_required':
      return { text: 'Auth: Not authorized', color: 'red' };
    case 'cli_not_found':
      return { text: 'Auth: checking...', color: 'gray' };
    default:
      return { text: 'Auth: Check failed', color: 'red' };
  }
}

export function getAuthGuidanceText(settings: SyncPluginSettings): string {
  if (!settings.lastPreflightStatus || settings.lastPreflightStatus === 'ok') {
    return '';
  }
  switch (settings.lastPreflightStatus) {
    case 'auth_required':
      return 'Run \`lark-cli auth login\` in your terminal to authorize.';
    case 'cli_not_found':
      return 'Install lark-cli and ensure it is available in your PATH.';
    default:
      return settings.folderResolutionError || 'Preflight check failed. See console for details.';
  }
}

export class SyncSettingsTab extends PluginSettingTab {
  private resolutionStatusEl: HTMLElement | null = null;
  private cliStatusEl: HTMLElement | null = null;
  private authStatusEl: HTMLElement | null = null;
  private authGuidanceEl: HTMLElement | null = null;
  private refreshButtonEl: HTMLElement | null = null;
  private isRefreshing = false;

  constructor(
    app: App,
    private plugin: any,
    private onSettingsChange: (settings: SyncPluginSettings) => void,
    private onRefresh?: () => Promise<void>,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Feishu Sync Settings' });

    // CLI status display section
    const cliStatusSetting = new Setting(containerEl)
      .setName('CLI status')
      .setDesc('Feishu CLI (lark-cli) installation status');
    this.cliStatusEl = cliStatusSetting.descEl.createSpan({ cls: 'feishu-sync-cli-status' });
    this.updateCliStatus();

    // Auth status display section
    const authStatusSetting = new Setting(containerEl)
      .setName('Auth status')
      .setDesc('Feishu CLI authorization state');
    this.authStatusEl = authStatusSetting.descEl.createSpan({ cls: 'feishu-sync-auth-status' });
    this.authGuidanceEl = authStatusSetting.descEl.createEl('div', { cls: 'feishu-sync-auth-guidance' });
    this.updateAuthStatus();

    // Refresh button
    if (this.onRefresh) {
      new Setting(containerEl)
        .setName('Refresh status')
        .setDesc('Re-check CLI installation and authorization')
        .addButton(button => {
          button.setButtonText('Refresh');
          button.setCta();
          this.refreshButtonEl = button.buttonEl;
          button.onClick(async () => {
            if (this.isRefreshing) return;
            this.isRefreshing = true;
            this.setRefreshLoading(true);
            try {
              await this.onRefresh!();
              this.updateCliStatus();
              this.updateAuthStatus();
              this.updateResolutionStatus();
            } finally {
              this.isRefreshing = false;
              this.setRefreshLoading(false);
            }
          });
        });
    }

    const folderPathSetting = new Setting(containerEl)
      .setName('Folder path')
      .setDesc('Feishu Drive folder path for file sync (e.g., /My Documents/Sync)')
      .addText(text => text
        .setPlaceholder('/My Documents/Sync')
        .setValue((this.plugin.settings?.folderPath || ''))
        .onChange(async value => {
          this.plugin.settings.folderPath = value;
          this.plugin.settings.resolvedFolderToken = '';
          this.plugin.settings.folderResolutionError = '';
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
          this.updateResolutionStatus();
        }));

    this.resolutionStatusEl = folderPathSetting.descEl.createSpan({ cls: 'feishu-sync-resolution-status' });
    this.updateResolutionStatus();

    new Setting(containerEl)
      .setName('Sync on save')
      .setDesc('Automatically sync notes when saved')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings?.syncOnSave ?? true)
        .onChange(async value => {
          this.plugin.settings.syncOnSave = value;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));
  }

  private setRefreshLoading(loading: boolean): void {
    if (!this.refreshButtonEl) return;
    (this.refreshButtonEl as any).disabled = loading;
    this.refreshButtonEl.setText(loading ? 'Refreshing...' : 'Refresh');
  }

  private updateCliStatus(): void {
    if (!this.cliStatusEl) return;
    const display = getCliStatusDisplay(this.plugin.settings);
    this.cliStatusEl.setText(display.text);
    (this.cliStatusEl as any).style.color = display.color;
  }

  private updateAuthStatus(): void {
    if (!this.authStatusEl) return;
    const display = getAuthStatusDisplay(this.plugin.settings);
    this.authStatusEl.setText(display.text);
    (this.authStatusEl as any).style.color = display.color;

    const guidance = getAuthGuidanceText(this.plugin.settings);
    if (this.authGuidanceEl) {
      this.authGuidanceEl.setText(guidance);
      (this.authGuidanceEl as any).style.color = guidance ? 'red' : 'inherit';
    }
  }

  private updateResolutionStatus(): void {
    if (!this.resolutionStatusEl) return;
    const token = this.plugin.settings?.resolvedFolderToken;
    const path = this.plugin.settings?.folderPath;
    const error = this.plugin.settings?.folderResolutionError;

    if (!path) {
      this.resolutionStatusEl.setText('');
      return;
    }

    if (token) {
      this.resolutionStatusEl.setText(` ✓ Resolved: ${path}`);
      (this.resolutionStatusEl as any).style.color = 'green';
    } else if (error) {
      this.resolutionStatusEl.setText(` ⚠ ${error}`);
      (this.resolutionStatusEl as any).style.color = 'red';
    } else {
      this.resolutionStatusEl.setText(' ⟳ Resolving folder path...');
      (this.resolutionStatusEl as any).style.color = 'var(--text-muted)';
    }
  }
}
