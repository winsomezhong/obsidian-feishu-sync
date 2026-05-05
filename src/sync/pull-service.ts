import { Plugin, Notice, TFile } from 'obsidian';
import type { FeishuCliBridge } from '../bridge/feishu-cli-bridge';
import type { SyncStatusTracker, FileSyncState } from './sync-status-tracker';
import type { ConflictResolver } from './conflict-resolver';
import type { OnlineDocConverter } from './online-doc-converter';
import type { RemoteFile, SyncDirection } from '../types';
import type { SyncPluginSettings } from '../ui/settings-tab';

export interface PullFileResult {
  success: boolean;
  error?: string;
}

export interface PullBatchResult {
  successCount: number;
  failCount: number;
  errors: Array<{ path: string; error: string }>;
  conflicts: Array<{ path: string }>;
  pulls: Array<{ path: string }>;
  pushes: Array<{ path: string }>;
}

const ONLINE_TYPES = new Set(['docx', 'sheet', 'bitable']);

export class PullService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private plugin: Plugin,
    private bridge: Pick<FeishuCliBridge, 'listRemoteFiles' | 'listAllFilesRecursive' | 'downloadFile' | 'exportDoc' | 'uploadFile'>,
    private tracker: Pick<SyncStatusTracker, 'getFileState' | 'updateFileState' | 'removeFileState' | 'getAllFiles'>,
    private resolver: Pick<ConflictResolver, 'resolveBidirectional'>,
    private converter: OnlineDocConverter,
    private getSettings: () => SyncPluginSettings,
    private getFolderToken: () => string,
  ) {}

  start(): void {
    if (this.timer) return;
    const settings = this.getSettings();
    if (!settings.pullEnabled) return;
    const intervalMs = Math.max(60000, settings.pullIntervalMinutes * 60 * 1000);
    this.timer = setInterval(() => {
      this.pullAll().catch(err => console.error('PullService: periodic pull failed', err));
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pullAll(): Promise<PullBatchResult> {
    const result: PullBatchResult = {
      successCount: 0, failCount: 0, errors: [], conflicts: [], pulls: [], pushes: [],
    };
    const settings = this.getSettings();
    const folderToken = this.getFolderToken();
    if (!folderToken) return result;

    let remoteFiles: RemoteFile[];
    try {
      remoteFiles = await this.bridge.listAllFilesRecursive(folderToken);
    } catch (err) {
      result.errors.push({ path: '(list)', error: (err as Error).message });
      result.failCount++;
      return result;
    }

    for (const file of remoteFiles) {
      try {
        await this.processRemoteFile(file, settings, result);
      } catch (err) {
        result.errors.push({ path: file.name, error: (err as Error).message });
        result.failCount++;
      }
    }

    // Sync deletes: remove local files that are tracked but no longer exist remotely
    if (settings.syncDeletesToLocal) {
      const remoteTokens = new Set(remoteFiles.map(f => f.token));
      for (const tracked of this.tracker.getAllFiles()) {
        if (!remoteTokens.has(tracked.feishuFileToken)) {
          try {
            const vault = this.plugin.app.vault;
            const existing = vault.getAbstractFileByPath(tracked.localPath);
            if (existing instanceof TFile) {
              await vault.delete(existing);
            }
            this.tracker.removeFileState(tracked.localPath);
          } catch (err) {
            result.errors.push({ path: tracked.localPath, error: (err as Error).message });
            result.failCount++;
          }
        }
      }
    }

    return result;
  }

  async pullFile(fileToken: string): Promise<PullFileResult> {
    const folderToken = this.getFolderToken();
    if (!folderToken) return { success: false, error: 'No folder token configured' };

    try {
      const remoteFiles = await this.bridge.listAllFilesRecursive(folderToken);
      const file = remoteFiles.find(f => f.token === fileToken);
      if (!file) return { success: false, error: `File not found: ${fileToken}` };

      const settings = this.getSettings();
      const result: PullBatchResult = {
        successCount: 0, failCount: 0, errors: [], conflicts: [], pulls: [], pushes: [],
      };
      await this.processRemoteFile(file, settings, result);
      return result.pulls.length > 0
        ? { success: true }
        : { success: false, error: 'File was skipped or conflicted' };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  private async processRemoteFile(
    file: RemoteFile,
    settings: SyncPluginSettings,
    result: PullBatchResult,
  ): Promise<void> {
    if (file.type === 'folder') return;

    const isOnlineDoc = ONLINE_TYPES.has(file.type);

    // For regular files, only process .md files
    if (!isOnlineDoc && !file.name.endsWith('.md')) return;

    const prefix = file.path ? `${file.path}/` : '';
    const localFileName = isOnlineDoc ? `${prefix}${file.name}.md` : `${prefix}${file.name}`;

    const state = this.tracker.getFileState(localFileName);

    // Skip new files if discoverNewFiles is disabled
    if (!state && !settings.discoverNewFiles) return;

    const remoteModifiedNum = new Date(file.modifiedAt).getTime();
    const decision = this.resolver.resolveBidirectional(
      state ? this.getLocalMtime(state) : 0,
      remoteModifiedNum,
      state,
    );

    if (decision === 'skip') return;

    if (decision === 'push' && state) {
      await this.handlePush(file, state, settings, result);
      return;
    }

    if (decision === 'conflict') {
      await this.handleConflict(file, state!, isOnlineDoc, localFileName, result);
      return;
    }

    // decision === 'pull'
    if (isOnlineDoc) {
      await this.handleOnlineDocPull(file, localFileName, result);
    } else {
      await this.handleRegularFilePull(file, state, localFileName, result);
    }
  }

  private async handleOnlineDocPull(
    file: RemoteFile,
    localFileName: string,
    result: PullBatchResult,
  ): Promise<void> {
    const { content, frontmatter } = await this.converter.convert(file.token, file.type, file.modifiedAt);
    const fullContent = frontmatter + content;
    const vault = this.plugin.app.vault;

    const existing = vault.getAbstractFileByPath(localFileName);
    if (existing instanceof TFile) {
      await vault.modify(existing, fullContent);
    } else {
      await vault.create(localFileName, fullContent);
    }

    this.tracker.updateFileState(localFileName, file.token, Date.now(), {
      isOnlineDoc: true,
      docType: file.type as 'docx' | 'sheet' | 'bitable',
      remoteModifiedAt: file.modifiedAt,
    });

    result.successCount++;
    result.pulls.push({ path: localFileName });
  }

  private async handleRegularFilePull(
    file: RemoteFile,
    state: FileSyncState | null,
    localFileName: string,
    result: PullBatchResult,
  ): Promise<void> {
    // Ensure parent directory exists before download
    const dirPath = localFileName.split('/').slice(0, -1).join('/');
    if (dirPath) {
      try {
        await this.plugin.app.vault.createFolder(dirPath);
      } catch {
        // folder may already exist
      }
    }

    const vaultBasePath = (this.plugin.app.vault.adapter as any).getBasePath();
    await this.bridge.downloadFile(file.token, localFileName, vaultBasePath);

    this.tracker.updateFileState(localFileName, file.token, Date.now(), {
      isOnlineDoc: false,
      remoteModifiedAt: file.modifiedAt,
    });

    result.successCount++;
    result.pulls.push({ path: localFileName });
  }

  private async handleConflict(
    file: RemoteFile,
    state: FileSyncState,
    isOnlineDoc: boolean,
    localFileName: string,
    result: PullBatchResult,
  ): Promise<void> {
    const vault = this.plugin.app.vault;
    const conflictFileName = localFileName.replace(/\.md$/, '.conflict.md');

    // Read current local content and save as .conflict.md
    const existing = vault.getAbstractFileByPath(localFileName);
    if (existing instanceof TFile) {
      const currentContent = await vault.read(existing);
      await vault.create(conflictFileName, currentContent);
    }

    // Pull the remote version
    if (isOnlineDoc) {
      await this.handleOnlineDocPull(file, localFileName, result);
    } else {
      await this.handleRegularFilePull(file, state, localFileName, result);
    }

    result.conflicts.push({ path: conflictFileName });
  }

  private async handlePush(
    file: RemoteFile,
    state: FileSyncState,
    settings: SyncPluginSettings,
    result: PullBatchResult,
  ): Promise<void> {
    // Push local changes to Feishu
    const vaultBasePath = (this.plugin.app.vault.adapter as any).getBasePath();
    const localFileName = state.localPath;
    const folderToken = this.getFolderToken();
    await this.bridge.uploadFile(localFileName, folderToken, localFileName.split('/').pop() || localFileName, vaultBasePath);

    this.tracker.updateFileState(localFileName, state.feishuFileToken, Date.now());

    result.successCount++;
    result.pushes.push({ path: localFileName });
  }

  private getLocalMtime(state: FileSyncState): number {
    return state.lastLocalMtime || Date.now();
  }
}
