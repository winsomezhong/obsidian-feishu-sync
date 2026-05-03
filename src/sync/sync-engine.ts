import { Plugin, TFile } from 'obsidian';
import { FeishuCliBridge } from '../bridge/feishu-cli-bridge';
import { SyncStatusTracker } from './sync-status-tracker';
import { ConflictResolver } from './conflict-resolver';
import { Preprocessor } from '../converter/preprocessor';

export class SyncEngine {
  private running = false;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private cachedFolderToken: string | null = null;
  private cachedFolderPath: string | null = null;

  constructor(
    private plugin: Plugin,
    private bridge: FeishuCliBridge,
    private tracker: SyncStatusTracker,
    private resolver: ConflictResolver,
    private preprocessor: Preprocessor,
    private getFolderPath: () => string,
    private resolveFolderToken: (path: string) => Promise<string>,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const vault = this.plugin.app.vault;
    this.plugin.registerEvent(
      (vault.on as any)('modify', (file: TFile) => this.onFileChange(file)),
    );
    this.plugin.registerEvent(
      (vault.on as any)('create', (file: TFile) => this.onFileChange(file)),
    );
    this.plugin.registerEvent(
      (vault.on as any)('delete', (file: TFile) => this.onFileDelete(file)),
    );
    this.plugin.registerEvent(
      (vault.on as any)('rename', (file: TFile, oldPath: string) => this.onFileRename(file, oldPath)),
    );
  }

  stop(): void {
    this.running = false;
    this.debounceTimers.forEach(t => clearTimeout(t));
    this.debounceTimers.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  private async getResolvedFolderToken(): Promise<string> {
    const currentPath = this.getFolderPath();
    if (!currentPath) return '';

    if (this.cachedFolderToken !== null && this.cachedFolderPath === currentPath) {
      return this.cachedFolderToken;
    }

    const token = await this.resolveFolderToken(currentPath);
    this.cachedFolderToken = token;
    this.cachedFolderPath = currentPath;
    return token;
  }

  async syncFile(file: TFile): Promise<void> {
    if (file.extension !== 'md') return;

    const folderPath = this.getFolderPath();
    if (!folderPath) {
      console.warn('Feishu Sync: folder path not set, skipping', file.path);
      return;
    }

    const folderToken = await this.getResolvedFolderToken();
    if (!folderToken) return;

    const state = this.tracker.getFileState(file.path);
    const decision = this.resolver.resolve(file.stat.mtime, state);
    if (decision === 'skip') return;

    const content = await this.plugin.app.vault.read(file);
    const { content: processedContent } = this.preprocessor.process(content);

    if (!state || !state.feishuDocToken) {
      const title = file.name.replace(/\.md$/, '');
      const fullContent = `# ${title}\n\n${processedContent}`;
      const result = await this.bridge.createDocument(title, fullContent, folderToken);
      this.tracker.updateFileState(file.path, result.documentId, file.stat.mtime);
    } else {
      const fullContent = `# ${file.name.replace(/\.md$/, '')}\n\n${processedContent}`;
      await this.bridge.updateDocument(state.feishuDocToken, fullContent);
      this.tracker.updateFileState(file.path, state.feishuDocToken, file.stat.mtime);
    }
  }

  async syncAll(): Promise<void> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    const errors: Array<{ path: string; error: Error }> = [];
    let successCount = 0;

    for (const file of files) {
      try {
        await this.syncFile(file);
        successCount++;
      } catch (err) {
        errors.push({ path: file.path, error: err as Error });
      }
    }

    if (errors.length > 0) {
      console.warn(`SyncAll: ${successCount} succeeded, ${errors.length} failed:`, errors);
    }
  }

  private onFileChange(file: TFile): void {
    if (file.extension !== 'md') return;

    const existing = this.debounceTimers.get(file.path);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      file.path,
      setTimeout(async () => {
        this.debounceTimers.delete(file.path);
        try {
          await this.syncFile(file);
        } catch (err) {
          console.error(`Sync error for ${file.path}:`, err);
        }
      }, 2000),
    );
  }

  private async onFileDelete(file: TFile): Promise<void> {
    if (file.extension !== 'md') return;
    const state = this.tracker.getFileState(file.path);
    if (state) {
      try {
        await this.bridge.deleteDocument(state.feishuDocToken);
      } catch (err) {
        console.error(`Failed to delete Feishu doc for ${file.path}:`, err);
      }
      this.tracker.removeFileState(file.path);
    }
  }

  private async onFileRename(file: TFile, oldPath: string): Promise<void> {
    if (file.extension !== 'md') return;
    const state = this.tracker.getFileState(oldPath);
    if (state) {
      this.tracker.removeFileState(oldPath);
      this.tracker.updateFileState(file.path, state.feishuDocToken, file.stat.mtime);
      try {
        const title = file.name.replace(/\.md$/, '');
        const content = await this.plugin.app.vault.read(file);
        const { content: processedContent } = this.preprocessor.process(content);
        await this.bridge.updateDocument(state.feishuDocToken, `# ${title}\n\n${processedContent}`);
      } catch (err) {
        console.error(`Failed to update Feishu title for ${file.path}:`, err);
      }
    }
  }
}
