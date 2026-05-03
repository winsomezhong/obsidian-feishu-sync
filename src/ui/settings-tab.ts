import { App, PluginSettingTab, Setting } from 'obsidian';
import type { ProcessorConfig } from '../converter/preprocessor';

export interface SyncPluginSettings {
  folderPath: string;
  resolvedFolderToken: string;
  processorConfig: ProcessorConfig;
  syncOnSave: boolean;
}

export const DEFAULT_SETTINGS: SyncPluginSettings = {
  folderPath: '',
  resolvedFolderToken: '',
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
      .setDesc('Feishu Drive folder path for document sync (e.g., /My Documents/Sync)')
      .addText(text => text
        .setPlaceholder('/My Documents/Sync')
        .setValue((this.plugin.settings?.folderPath || ''))
        .onChange(async value => {
          this.plugin.settings.folderPath = value;
          this.plugin.settings.resolvedFolderToken = '';
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

    new Setting(containerEl)
      .setName('Tag strategy')
      .setDesc('How to handle #tags')
      .addDropdown(dropdown => dropdown
        .addOption('keep-inline', 'Keep inline')
        .addOption('strip', 'Strip')
        .setValue(this.plugin.settings?.processorConfig?.tag || 'keep-inline')
        .onChange(async value => {
          this.plugin.settings.processorConfig.tag = value as any;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));

    new Setting(containerEl)
      .setName('Dataview strategy')
      .setDesc('How to handle ```dataview blocks')
      .addDropdown(dropdown => dropdown
        .addOption('comment-out', 'Comment out')
        .addOption('strip', 'Strip')
        .setValue(this.plugin.settings?.processorConfig?.dataview || 'comment-out')
        .onChange(async value => {
          this.plugin.settings.processorConfig.dataview = value as any;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));

    new Setting(containerEl)
      .setName('Image strategy')
      .setDesc('How to handle ![[image]] references')
      .addDropdown(dropdown => dropdown
        .addOption('upload', 'Upload placeholder')
        .addOption('strip', 'Strip')
        .setValue(this.plugin.settings?.processorConfig?.image || 'strip')
        .onChange(async value => {
          this.plugin.settings.processorConfig.image = value as any;
          await this.plugin.saveData(this.plugin.settings);
          this.onSettingsChange(this.plugin.settings);
        }));

    new Setting(containerEl)
      .setName('Table max rows')
      .setDesc('Maximum rows per table before splitting (default: 9)')
      .addText(text => text
        .setPlaceholder('9')
        .setValue(String(this.plugin.settings?.processorConfig?.tableMaxRows ?? 9))
        .onChange(async value => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.processorConfig.tableMaxRows = num;
            await this.plugin.saveData(this.plugin.settings);
            this.onSettingsChange(this.plugin.settings);
          }
        }));
  }

  private updateResolutionStatus(): void {
    if (!this.resolutionStatusEl) return;
    const token = this.plugin.settings?.resolvedFolderToken;
    const path = this.plugin.settings?.folderPath;
    if (!path) {
      this.resolutionStatusEl.setText('');
      return;
    }
    if (token) {
      this.resolutionStatusEl.setText(' ✓ Resolved');
      this.resolutionStatusEl.style.color = 'green';
    } else {
      this.resolutionStatusEl.setText(' ⚠ Not resolved');
      this.resolutionStatusEl.style.color = 'red';
    }
  }
}
