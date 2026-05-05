// Mock implementation of obsidian types for testing
export class Plugin {
  registerEvent: (event: unknown) => void;
  addCommand: (cmd: any) => void;
  addSettingTab: (tab: any) => void;
  addStatusBarItem: () => any;
  registerInterval: (id: number) => number;
  loadData: () => Promise<any>;
  saveData: (d: any) => Promise<void>;
  manifest: { dir?: string };
  app: { vault: Vault; workspace: { getActiveFile: () => TFile | null } };

  constructor() {
    this.registerEvent = () => {};
    this.addCommand = () => {};
    this.addSettingTab = () => {};
    this.addStatusBarItem = () => ({ setText: () => {}, onClick: () => {} });
    this.registerInterval = (id: number) => id;
    this.loadData = async () => ({});
    this.saveData = async () => {};
    this.manifest = {};
    this.app = { vault: new Vault(), workspace: { getActiveFile: () => null } };
  }
}

export class TFile {
  path: string;
  name: string;
  extension: string;
  stat: { mtime: number; ctime: number; size: number };

  constructor() {
    this.path = '';
    this.name = '';
    this.extension = '';
    this.stat = { mtime: 0, ctime: 0, size: 0 };
  }
}

export class TFolder {
  path: string;
  name: string;
  children: any[];
  parent: TFolder | null;

  constructor() {
    this.path = '';
    this.name = '';
    this.children = [];
    this.parent = null;
  }
}

export class App {
  vault: Vault;
  workspace: { getActiveFile: () => TFile | null };

  constructor() {
    this.vault = new Vault();
    this.workspace = { getActiveFile: () => null };
  }
}

export class PluginSettingTab {
  app: App;
  plugin: any;
  containerEl: HTMLElement;

  constructor(app: App, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  display(): void {}
}

export class Setting {
  containerEl: HTMLElement;
  settingEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  private _onChangeCallbacks: Array<(value: string) => void> = [];

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
    this.settingEl = containerEl.createDiv({ cls: 'setting-item' });
    const infoEl = this.settingEl.createDiv({ cls: 'setting-item-info' });
    this.nameEl = infoEl.createDiv({ cls: 'setting-item-name' });
    this.descEl = infoEl.createDiv({ cls: 'setting-item-desc' });
    this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-controls' });
  }
  setName(name: string): this {
    this.nameEl.setText(name);
    return this;
  }
  setDesc(desc: string): this {
    this.descEl.setText(desc);
    return this;
  }
  addText(cb: (text: any) => void): this {
    const textComponent = {
      setPlaceholder: () => textComponent,
      setValue: () => textComponent,
      onChange: (fn: (value: string) => void) => {},
    };
    cb(textComponent);
    return this;
  }
  addToggle(cb: (toggle: any) => void): this {
    const toggleComponent = {
      setValue: () => toggleComponent,
      onChange: (fn: (value: boolean) => void) => {},
    };
    cb(toggleComponent);
    return this;
  }
  addDropdown(cb: (dropdown: any) => void): this {
    const selectEl = this.controlEl.createEl('select');
    const dropdownComponent = {
      addOption: (value: string, display: string) => {
        selectEl.createEl('option', { value, text: display });
        return dropdownComponent;
      },
      setValue: (val: string) => {
        selectEl.value = val;
        return dropdownComponent;
      },
      onChange: (fn: (value: string) => void) => {
        selectEl.addEventListener('change', () => fn(selectEl.value));
        return dropdownComponent;
      },
    };
    cb(dropdownComponent);
    return this;
  }
  addButton(cb: (button: any) => void): this {
    const buttonEl = this.controlEl.createEl('button');
    const buttonComponent = {
      setButtonText: (text: string) => { buttonEl.setText(text); return buttonComponent; },
      setCta: () => { buttonEl.addClass('mod-cta'); return buttonComponent; },
      setDisabled: (disabled: boolean) => { (buttonEl as any).disabled = disabled; return buttonComponent; },
      onClick: (fn: () => void) => {
        buttonEl.addEventListener('click', fn);
        return buttonComponent;
      },
      buttonEl,
    };
    cb(buttonComponent);
    return this;
  }
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}

class Vault {
  on: (event: string, callback: (...args: any[]) => void) => void = () => {};
  read: (file: TFile) => Promise<string> = async () => '';
  getMarkdownFiles: () => TFile[] = () => {};
  configDir: string = '.obsidian';
  delete: (file: TFile | TFolder, force?: boolean) => Promise<void> = async () => {};
  getAbstractFileByPath: (path: string) => TFile | TFolder | null = () => null;
}
