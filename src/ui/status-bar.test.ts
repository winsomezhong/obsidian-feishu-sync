import { describe, it, expect, vi } from 'vitest';
import { SyncStatusBar } from './status-bar';

describe('SyncStatusBar', () => {
  it('shows ready state by default', () => {
    const setText = vi.fn();
    const item = { setText, onClick: vi.fn() };
    const bar = new SyncStatusBar(item as any);
    expect(setText).toHaveBeenCalledWith('FS Sync: ✓');
  });

  it('updates to syncing state', () => {
    const setText = vi.fn();
    const bar = new SyncStatusBar({ setText, onClick: vi.fn() } as any);
    bar.updateDisplay('syncing');
    expect(setText).toHaveBeenCalledWith('FS Sync: ⟳');
  });

  it('updates to error state with message', () => {
    const setText = vi.fn();
    const bar = new SyncStatusBar({ setText, onClick: vi.fn() } as any);
    bar.updateDisplay('error', 'CLI not found');
    expect(setText).toHaveBeenCalledWith('FS Sync: ⚠ CLI not found');
  });

  it('registers click handler', () => {
    const onClick = vi.fn();
    const callback = vi.fn();
    const bar = new SyncStatusBar({ setText: vi.fn(), onClick } as any);
    bar.onClick(callback);
    expect(onClick).toHaveBeenCalledWith(callback);
  });
});
