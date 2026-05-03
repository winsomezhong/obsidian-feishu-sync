export const e2eConfig = {
  vaultName: 'obsvault',
  vaultPath: 'D:\\华为云盘\\obsvault',
  testPrefix: 'raw/',
  debounceWaitMs: 5000,
  folderToken: process.env.FEISHU_FOLDER_TOKEN || '',
  obsidianExe: process.env.OBSIDIAN_EXE || 'D:\\Tools\\Obsidian\\Obsidian.exe',
  larkExe: 'lark-cli',
};
