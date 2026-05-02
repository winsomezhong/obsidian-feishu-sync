import { App, PluginSettingTab, Setting } from 'obsidian';

export interface SyncPluginSettings {
  folderToken: string;
  syncOnSave: boolean;
}

export const DEFAULT_SETTINGS: SyncPluginSettings = {
  folderToken: '',
  syncOnSave: true,
};

export class SyncSettingsTab extends PluginSettingTab {
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

    new Setting(containerEl)
      .setName('Sync root folder token')
      .setDesc('Feishu Drive folder token for file sync (files are uploaded preserving vault directory structure under this folder)')
      .addText(text => text
        .setPlaceholder('Enter folder token')
        .setValue((this.plugin.settings?.folderToken || ''))
        .onChange(async value => {
          this.plugin.settings.folderToken = value;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));

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
}
