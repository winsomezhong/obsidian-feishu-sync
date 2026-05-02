export class SyncStatusBar {
  private statusBarItem: any;
  private currentText = 'FS Sync: ✓';

  constructor(statusBarItem: any) {
    this.statusBarItem = statusBarItem;
    this.updateDisplay('ready');
  }

  updateDisplay(state: 'ready' | 'syncing' | 'error', message?: string): void {
    switch (state) {
      case 'ready':
        this.currentText = 'FS Sync: ✓';
        break;
      case 'syncing':
        this.currentText = 'FS Sync: ⟳';
        break;
      case 'error':
        this.currentText = `FS Sync: ⚠ ${message || ''}`;
        break;
    }
    this.statusBarItem.setText(this.currentText);
  }

  onClick(callback: () => void): void {
    this.statusBarItem.onClick(callback);
  }
}
