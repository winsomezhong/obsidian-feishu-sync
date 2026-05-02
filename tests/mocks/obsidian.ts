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
  constructor(containerEl: HTMLElement) {}
  setName(name: string): this { return this; }
  setDesc(desc: string): this { return this; }
  addText(cb: (text: any) => void): this { cb({ setPlaceholder: () => this, setValue: () => this, onChange: () => {} }); return this; }
  addToggle(cb: (toggle: any) => void): this { cb({ setValue: () => this, onChange: () => {} }); return this; }
  addDropdown(cb: (dropdown: any) => void): this { cb({ addOption: () => this, setValue: () => this, onChange: () => {} }); return this; }
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}

class Vault {
  on: (event: string, callback: (...args: any[]) => void) => void = () => {};
  read: (file: TFile) => Promise<string> = async () => '';
  getMarkdownFiles: () => TFile[] = () => {};
  configDir: string = '.obsidian';
}
