import { App, PluginSettingTab, Setting } from 'obsidian';

export interface SyncPluginSettings {
  folderPath: string;
  resolvedFolderToken: string;
  folderResolutionError: string;
  syncOnSave: boolean;
}

export const DEFAULT_SETTINGS: SyncPluginSettings = {
  folderPath: '',
  resolvedFolderToken: '',
  folderResolutionError: '',
  syncOnSave: true,
};

export class SyncSettingsTab extends PluginSettingTab {
  private resolutionStatusEl: HTMLElement | null = null;

  constructor(
    app: App,
    private plugin: any,
    private onSettingsChange: (settings: SyncPluginSettings) => void,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Feishu Sync Settings' });

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
