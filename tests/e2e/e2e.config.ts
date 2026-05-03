export const e2eConfig = {
  vaultName: 'obsvault',
  vaultPath: 'D:\\华为云盘\\obsvault',
  testPrefix: '_e2etest/',
  debounceWaitMs: 8000,
  folderPath: process.env.FEISHU_FOLDER_PATH || '/obsvault',
  obsidianExe: process.env.OBSIDIAN_EXE || 'D:\\Tools\\Obsidian\\Obsidian.exe',
  larkExe: 'lark-cli',
};
