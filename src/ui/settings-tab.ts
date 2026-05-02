import { App, PluginSettingTab, Setting } from 'obsidian';
import type { ProcessorConfig } from '../converter/preprocessor';

export interface SyncPluginSettings {
  folderToken: string;
  processorConfig: ProcessorConfig;
  syncOnSave: boolean;
}

export const DEFAULT_SETTINGS: SyncPluginSettings = {
  folderToken: '',
  processorConfig: {
    frontmatter: 'strip',
    wikilink: 'keep-text',
    tag: 'keep-inline',
    dataview: 'comment-out',
    image: 'strip',
    tableMaxRows: 9,
    callout: 'strip-type',
    math: 'keep',
  },
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
      .setName('Folder token')
      .setDesc('Feishu Drive folder token for document sync')
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

    new Setting(containerEl)
      .setName('Frontmatter strategy')
      .setDesc('How to handle YAML frontmatter')
      .addDropdown(dropdown => dropdown
        .addOption('strip', 'Strip')
        .addOption('keep-as-text', 'Keep as text')
        .setValue(this.plugin.settings?.processorConfig?.frontmatter || 'strip')
        .onChange(async value => {
          this.plugin.settings.processorConfig.frontmatter = value as any;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));

    new Setting(containerEl)
      .setName('Wikilink strategy')
      .setDesc('How to handle [[wikilink]] syntax')
      .addDropdown(dropdown => dropdown
        .addOption('keep-text', 'Keep text')
        .addOption('strip', 'Strip')
        .setValue(this.plugin.settings?.processorConfig?.wikilink || 'keep-text')
        .onChange(async value => {
          this.plugin.settings.processorConfig.wikilink = value as any;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));
  }
}
