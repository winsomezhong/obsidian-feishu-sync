import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { exec } from 'child_process';
import type { PreflightStatus } from '../types';
import { t } from '../i18n';
import type { Locale } from '../i18n';

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
    return { text: 'lark-cli: checking...', color: 'gray' };
  }
  if (settings.lastPreflightStatus === 'ok') {
    const version = settings.cliVersion ? ` (v${settings.cliVersion})` : '';
    return { text: `lark-cli: ready${version}`, color: 'green' };
  }
  if (settings.lastPreflightStatus === 'cli_not_found') {
    return { text: 'lark-cli: not ready', color: 'red' };
  }
  // For auth-related statuses, CLI was found but auth failed
  const version = settings.cliVersion ? ` (v${settings.cliVersion})` : '';
  return { text: `lark-cli: ready${version}`, color: 'green' };
}

export interface AuthStatusDisplay {
  text: string;
  color: string;
}

export function getAuthStatusDisplay(settings: SyncPluginSettings): AuthStatusDisplay {
  if (!settings.lastPreflightStatus) {
    return { text: 'Checking...', color: 'gray' };
  }
  switch (settings.lastPreflightStatus) {
    case 'ok':
      return { text: 'Authorized', color: 'green' };
    case 'auth_required':
      return { text: 'Not authorized', color: 'red' };
    case 'cli_not_found':
      return { text: 'Checking...', color: 'gray' };
    default:
      return { text: 'Check failed', color: 'red' };
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

export function launchAuthLogin(): void {
  const cmd = 'lark-cli auth login';
  let terminalCmd: string;
  if (process.platform === 'win32') {
    terminalCmd = `start cmd /c "${cmd} & pause"`;
  } else if (process.platform === 'darwin') {
    terminalCmd = `osascript -e 'tell app "Terminal" to do script "${cmd}"'`;
  } else {
    terminalCmd = `x-terminal-emulator -e "bash -c '${cmd}; exec bash'"`;
  }
  exec(terminalCmd, (err) => {
    if (err) {
      new Notice(`Failed to launch terminal. Please run manually: ${cmd}`);
    } else {
      new Notice('Authorization command launched. Follow the instructions in the terminal window.');
    }
  });
}

export class SyncSettingsTab extends PluginSettingTab {
  private resolutionStatusEl: HTMLElement | null = null;
  private cliStatusEl: HTMLElement | null = null;
  private cliStatusDescEl: HTMLElement | null = null;
  private authStatusEl: HTMLElement | null = null;
  private authGuidanceEl: HTMLElement | null = null;
  private refreshButtonEl: HTMLElement | null = null;
  private isRefreshing = false;
  private resolveTimeout: ReturnType<typeof setTimeout> | null = null;

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

    const lang: Locale = this.plugin.settings?.language || 'en';

    containerEl.createEl('h2', { text: t('settingsTitle', lang) });

    // CLI status display section
    const cliStatusSetting = new Setting(containerEl)
      .setName(t('cliInstallStatus', lang))
      .setDesc(t('cliStatusDesc', lang));
    this.cliStatusDescEl = cliStatusSetting.descEl;
    this.cliStatusEl = cliStatusSetting.descEl.createSpan({ cls: 'feishu-sync-cli-status' });
    this.updateCliStatus();

    // Auth status display section
    const authStatusSetting = new Setting(containerEl)
      .setName(t('authStatus', lang))
      .setDesc(t('authStatusDesc', lang));
    this.authStatusEl = authStatusSetting.descEl.createSpan({ cls: 'feishu-sync-auth-status' });
    this.authGuidanceEl = authStatusSetting.descEl.createEl('div', { cls: 'feishu-sync-auth-guidance' });
    this.updateAuthStatus();

    // Authorize button - only shown when auth_required
    if (this.plugin.settings?.lastPreflightStatus === 'auth_required') {
      authStatusSetting.addButton(button => {
        button.setButtonText(t('authorize', lang));
        button.setCta();
        button.onClick(() => launchAuthLogin());
      });
    }

    // Refresh button
    if (this.onRefresh) {
      new Setting(containerEl)
        .setName(t('refreshStatus', lang))
        .setDesc(t('refreshDesc', lang))
        .addButton(button => {
          button.setButtonText(t('refresh', lang));
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

    // Language selector: placed after Refresh button, before Folder path
    new Setting(containerEl)
      .setName(t('language', lang))
      .setDesc(t('languageDesc', lang))
      .addDropdown(dropdown => dropdown
        .addOption('en', 'English')
        .addOption('zh', '中文')
        .setValue(this.plugin.settings?.language || 'en')
        .onChange(async value => {
          this.plugin.settings.language = value as Locale;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
          this.display();
        }));

    const folderPathSetting = new Setting(containerEl)
      .setName(t('folderPath', lang))
      .setDesc(t('folderPathDesc', lang))
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

          if (this.resolveTimeout) clearTimeout(this.resolveTimeout);
          if (value) {
            this.resolveTimeout = setTimeout(async () => {
              try {
                const token = await this.plugin.bridge.resolveFolderToken(value);
                this.plugin.settings.resolvedFolderToken = token;
                this.plugin.settings.folderResolutionError = '';
              } catch (err) {
                this.plugin.settings.resolvedFolderToken = '';
                this.plugin.settings.folderResolutionError = (err as Error).message;
              }
              await this.plugin.saveData(this.plugin.settings);
              this.onSettingsChange(this.plugin.settings);
              this.updateResolutionStatus();
            }, 500);
          }
        }));

    this.resolutionStatusEl = folderPathSetting.descEl.createSpan({ cls: 'feishu-sync-resolution-status' });
    this.updateResolutionStatus();

    new Setting(containerEl)
      .setName(t('syncOnSave', lang))
      .setDesc(t('syncOnSaveDesc', lang))
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
    const lang: Locale = this.plugin.settings?.language || 'en';
    (this.refreshButtonEl as any).disabled = loading;
    this.refreshButtonEl.setText(loading ? t('refreshing', lang) : t('refresh', lang));
  }

  private updateCliStatus(): void {
    if (!this.cliStatusEl) return;
    const display = getCliStatusDisplay(this.plugin.settings);
    this.cliStatusEl.setText(display.text);
    (this.cliStatusEl as any).style.color = display.color;

    // Add install guide link when CLI is not found
    const existingLink = (this.cliStatusDescEl as any)?.querySelector('.feishu-sync-install-link');
    if (existingLink) {
      existingLink.remove();
    }
    if (this.plugin.settings?.lastPreflightStatus === 'cli_not_found' && this.cliStatusDescEl) {
      const lang: Locale = this.plugin.settings?.language || 'en';
      this.cliStatusDescEl.createEl('a', {
        cls: 'feishu-sync-install-link',
        text: t('installGuide', lang),
        href: 'https://open.feishu.cn/document/tools-and-resources/feishu-cli/overview',
      });
    }
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
