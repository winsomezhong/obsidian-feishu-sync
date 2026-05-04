export type Locale = 'en' | 'zh';

export const LOCALE_KEYS: Locale[] = ['en', 'zh'];

const translations: Record<string, Record<Locale, string>> = {
  settingsTitle: {
    en: 'Feishu Sync Settings',
    zh: '飞书同步设置',
  },
  cliInstallStatus: {
    en: 'FeiShu CLI installation status',
    zh: '飞书 CLI 安装状态',
  },
  cliStatusDesc: {
    en: 'Feishu CLI (lark-cli) installation status',
    zh: '飞书 CLI (lark-cli) 安装状态',
  },
  cliReady: {
    en: 'lark-cli: ready',
    zh: 'lark-cli: 就绪',
  },
  cliNotReady: {
    en: 'lark-cli: not ready',
    zh: 'lark-cli: 未安装',
  },
  cliChecking: {
    en: 'lark-cli: checking...',
    zh: 'lark-cli: 检查中...',
  },
  installGuide: {
    en: 'Install lark-cli: https://open.feishu.cn/document/tools-and-resources/feishu-cli/overview',
    zh: '安装 lark-cli：https://open.feishu.cn/document/tools-and-resources/feishu-cli/overview',
  },
  authStatus: {
    en: 'Feishu CLI auth status',
    zh: '飞书 CLI 授权状态',
  },
  authStatusDesc: {
    en: 'Feishu CLI authorization state',
    zh: '飞书 CLI 授权状态',
  },
  authAuthorized: {
    en: 'Authorized',
    zh: '已授权',
  },
  authNotAuthorized: {
    en: 'Not authorized',
    zh: '未授权',
  },
  authChecking: {
    en: 'Checking...',
    zh: '检查中...',
  },
  authCheckFailed: {
    en: 'Check failed',
    zh: '检查失败',
  },
  authorize: {
    en: 'Authorize',
    zh: '授权',
  },
  refresh: {
    en: 'Refresh',
    zh: '刷新',
  },
  refreshing: {
    en: 'Refreshing...',
    zh: '刷新中...',
  },
  refreshStatus: {
    en: 'Refresh status',
    zh: '刷新状态',
  },
  refreshDesc: {
    en: 'Re-check CLI installation and authorization',
    zh: '重新检查 CLI 安装和授权状态',
  },
  folderPath: {
    en: 'Folder path',
    zh: '文件夹路径',
  },
  folderPathDesc: {
    en: 'Feishu Drive folder path for file sync',
    zh: '飞书云盘同步文件夹路径',
  },
  syncOnSave: {
    en: 'Sync on save',
    zh: '保存时同步',
  },
  syncOnSaveDesc: {
    en: 'Automatically sync notes when saved',
    zh: '保存笔记时自动同步',
  },
  language: {
    en: 'Language',
    zh: '语言',
  },
  languageDesc: {
    en: 'Interface language',
    zh: '界面语言',
  },
  authCommandCopied: {
    en: 'Command copied: lark-cli auth login',
    zh: '命令已复制：lark-cli auth login',
  },
  pullSettingsTitle: {
    en: 'Remote → Local (Pull)',
    zh: '远程 → 本地（拉取）',
  },
  pullEnabled: {
    en: 'Enable periodic pull',
    zh: '启用定时拉取',
  },
  pullEnabledDesc: {
    en: 'Automatically pull changes from Feishu Drive to local vault',
    zh: '自动从飞书云盘拉取变更到本地仓库',
  },
  pullInterval: {
    en: 'Pull interval (minutes)',
    zh: '拉取间隔（分钟）',
  },
  pullIntervalDesc: {
    en: 'How often to check for remote changes (1-1440 minutes)',
    zh: '多久检查一次远程变更（1-1440 分钟）',
  },
  discoverNewFiles: {
    en: 'Discover new files',
    zh: '发现新文件',
  },
  discoverNewFilesDesc: {
    en: 'Automatically pull newly discovered remote files',
    zh: '自动拉取新发现的远程文件',
  },
  syncDeletesToLocal: {
    en: 'Sync deletes to local',
    zh: '同步删除到本地',
  },
  syncDeletesToLocalDesc: {
    en: 'Delete local files when they are deleted on Feishu Drive',
    zh: '飞书云盘文件删除时同步删除本地文件',
  },
};

export const TRANSLATIONS = translations;

export function t(key: string, lang: Locale): string {
  const entry = translations[key];
  if (!entry) {
    return key;
  }
  return entry[lang] || entry.en;
}
