// Mock implementation of obsidian types for testing
export class Plugin {
  registerEvent: (event: unknown) => void;
  app: { vault: Vault };

  constructor() {
    this.registerEvent = () => {};
    this.app = { vault: new Vault() };
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

class Vault {
  on: (event: string, callback: (...args: any[]) => void) => void = () => {};
  read: (file: TFile) => Promise<string> = async () => '';
  getMarkdownFiles: () => TFile[] = () => [];
}
