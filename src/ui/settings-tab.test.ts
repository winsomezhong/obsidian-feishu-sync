import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { DEFAULT_SETTINGS, getCliStatusDisplay, getAuthStatusDisplay, getAuthGuidanceText, launchAuthLogin, SyncSettingsTab } from './settings-tab';
import type { SyncPluginSettings } from './settings-tab';
import { TRANSLATIONS } from '../i18n';
import { App, Notice, PluginSettingTab } from 'obsidian';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'child_process';

// ---- Minimal DOM environment for SyncSettingsTab tests ----
let _elementIdCounter = 0;

class MockEl {
  tagName: string;
  children: MockEl[] = [];
  parentNode: MockEl | null = null;
  _text = '';
  _attrs: Record<string, string> = {};
  _classes: string[] = [];
  _listeners: Record<string, Array<(...args: any[]) => void>> = {};
  _value = '';
  _disabled = false;
  style: Record<string, string> = {};
  id = `el-${++_elementIdCounter}`;

  constructor(tag: string) { this.tagName = tag.toUpperCase(); }

  createEl<K extends keyof HTMLElementTagNameMap>(tag: K, options?: { cls?: string; text?: string; value?: string; href?: string }): any {
    const el = new MockEl(tag as string);
    if (options?.cls) { for (const c of options.cls.split(' ')) el._classes.push(c); }
    if (options?.text) el._text = options.text;
    if (options?.value) el._attrs['value'] = options.value;
    if (options?.href) el._attrs['href'] = options.href;
    this.children.push(el); el.parentNode = this;
    return el;
  }

  createDiv(options?: { cls?: string; text?: string }): MockEl {
    return this.createEl('div', options);
  }

  createSpan(options?: { cls?: string; text?: string }): MockEl {
    return this.createEl('span', options);
  }

  setText(text: string): void { this._text = text; }
  get textContent(): string { return this._text; }
  set textContent(v: string) { this._text = v; }

  addClass(cls: string): void { this._classes.push(cls); }

  addEventListener(event: string, fn: (...args: any[]) => void): void {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  click(): void {
    const handlers = this._listeners['click'] || [];
    for (const fn of handlers) fn();
  }

  set value(v: string) { this._value = v; }
  get value(): string { return this._value; }
  set disabled(v: boolean) { this._disabled = v; }
  get disabled(): boolean { return this._disabled; }

  querySelector(sel: string): MockEl | null {
    // Support simple tag and class selectors
    const isTag = /^[a-z]+$/.test(sel);
    const isClass = sel.startsWith('.');
    const clsName = isClass ? sel.slice(1) : '';
    const tag = isTag ? sel.toUpperCase() : '';

    for (const child of this.children) {
      if (isTag && child.tagName === tag) return child;
      if (isClass && child._classes.includes(clsName)) return child;
      const found = child.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(sel: string): MockEl[] {
    const results: MockEl[] = [];
    const isTag = /^[a-z]+$/.test(sel);
    const isClass = sel.startsWith('.');
    const clsName = isClass ? sel.slice(1) : '';
    const tag = isTag ? sel.toUpperCase() : '';

    for (const child of this.children) {
      if (isTag && child.tagName === tag) results.push(child);
      if (isClass && child._classes.includes(clsName)) results.push(child);
      results.push(...child.querySelectorAll(sel));
    }
    return results;
  }

  remove(): void {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) this.parentNode.children.splice(idx, 1);
    }
  }

  empty(): void {
    this.children = [];
  }

  getElementsByClassName(cls: string): MockEl[] {
    const results: MockEl[] = [];
    for (const child of this.children) {
      if (child._classes.includes(cls)) results.push(child);
      results.push(...child.getElementsByClassName(cls));
    }
    return results;
  }
}

beforeAll(() => {
  (globalThis as any).document = {
    createElement(tag: string): MockEl {
      return new MockEl(tag);
    },
  };
  // Patch PluginSettingTab base class to use our mock document
  // (it already uses document.createElement via the mock module)
});

describe('DEFAULT_SETTINGS', () => {
  it('has folderPath, resolvedFolderToken, folderResolutionError, syncOnSave, cliVersion, lastPreflightStatus, lastPreflightTime, and language', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('folderPath');
    expect(DEFAULT_SETTINGS).toHaveProperty('resolvedFolderToken');
    expect(DEFAULT_SETTINGS).toHaveProperty('folderResolutionError');
    expect(DEFAULT_SETTINGS).toHaveProperty('syncOnSave');
    expect(DEFAULT_SETTINGS).toHaveProperty('cliVersion');
    expect(DEFAULT_SETTINGS).toHaveProperty('lastPreflightStatus');
    expect(DEFAULT_SETTINGS).toHaveProperty('lastPreflightTime');
    expect(DEFAULT_SETTINGS).toHaveProperty('language');
  });

  it('folderPath defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.folderPath).toBe('');
  });

  it('resolvedFolderToken defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.resolvedFolderToken).toBe('');
  });

  it('folderResolutionError defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.folderResolutionError).toBe('');
  });

  it('syncOnSave defaults to true', () => {
    expect(DEFAULT_SETTINGS.syncOnSave).toBe(true);
  });

  it('cliVersion defaults to undefined', () => {
    expect(DEFAULT_SETTINGS.cliVersion).toBeUndefined();
  });

  it('lastPreflightStatus defaults to undefined', () => {
    expect(DEFAULT_SETTINGS.lastPreflightStatus).toBeUndefined();
  });

  it('lastPreflightTime defaults to undefined', () => {
    expect(DEFAULT_SETTINGS.lastPreflightTime).toBeUndefined();
  });

  it('language defaults to en', () => {
    expect(DEFAULT_SETTINGS.language).toBe('en');
  });
});

describe('getCliStatusDisplay', () => {
  it('returns checking state when no preflight result persisted', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: checking...');
    expect(display.color).toBe('gray');
  });

  it('returns ready with version when CLI is ok', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok', cliVersion: '1.2.3' };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: ready (v1.2.3)');
    expect(display.color).toBe('green');
  });

  it('returns ready without version when cliVersion is missing', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok', cliVersion: undefined };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: ready');
    expect(display.color).toBe('green');
  });

  it('returns not ready when CLI is not installed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'cli_not_found' };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: not ready');
    expect(display.color).toBe('red');
  });

  it('returns ready for auth-related failures (CLI was found)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_required' };
    const display = getCliStatusDisplay(settings);
    expect(display.text).toBe('lark-cli: ready');
    expect(display.color).toBe('green');
  });
});

describe('getAuthStatusDisplay', () => {
  it('returns Checking... when no preflight result persisted', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Checking...');
    expect(display.color).toBe('gray');
  });

  it('returns Authorized when status is ok', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok' };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Authorized');
    expect(display.color).toBe('green');
  });

  it('returns Not authorized when auth is required', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_required' };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Not authorized');
    expect(display.color).toBe('red');
  });

  it('returns Check failed when auth check failed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_check_failed' };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Check failed');
    expect(display.color).toBe('red');
  });

  it('returns Check failed when preflight crashed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'preflight_crashed' };
    const display = getAuthStatusDisplay(settings);
    expect(display.text).toBe('Check failed');
    expect(display.color).toBe('red');
  });
});

describe('getAuthGuidanceText', () => {
  it('returns empty string when status is ok', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok' };
    expect(getAuthGuidanceText(settings)).toBe('');
  });

  it('returns empty string when status is undefined', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    expect(getAuthGuidanceText(settings)).toBe('');
  });

  it('returns re-auth guide when auth_required', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_required' };
    const text = getAuthGuidanceText(settings);
    expect(text).toContain('lark-cli auth login');
  });

  it('returns error message when auth_check_failed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_check_failed', folderResolutionError: 'Failed to parse auth status' };
    const text = getAuthGuidanceText(settings);
    expect(text).toContain('Failed to parse');
  });

  it('returns error message when preflight_crashed', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'preflight_crashed', folderResolutionError: 'Preflight error: network' };
    const text = getAuthGuidanceText(settings);
    expect(text).toContain('Preflight error');
  });

  it('returns CLI install guide when cli_not_found', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'cli_not_found' };
    const text = getAuthGuidanceText(settings);
    expect(text).toMatch(/install/i);
    expect(text).toContain('lark-cli');
  });
});

describe('i18n integration', () => {
  it('getCliStatusDisplay ready text matches cliReady translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok', cliVersion: undefined };
    expect(getCliStatusDisplay(settings).text).toBe(TRANSLATIONS.cliReady.en);
  });

  it('getCliStatusDisplay checking text matches cliChecking translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    expect(getCliStatusDisplay(settings).text).toBe(TRANSLATIONS.cliChecking.en);
  });

  it('getCliStatusDisplay not-ready text matches cliNotReady translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'cli_not_found' };
    expect(getCliStatusDisplay(settings).text).toBe(TRANSLATIONS.cliNotReady.en);
  });

  it('getAuthStatusDisplay authorized text matches authAuthorized translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'ok' };
    expect(getAuthStatusDisplay(settings).text).toBe(TRANSLATIONS.authAuthorized.en);
  });

  it('getAuthStatusDisplay not-authorized text matches authNotAuthorized translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_required' };
    expect(getAuthStatusDisplay(settings).text).toBe(TRANSLATIONS.authNotAuthorized.en);
  });

  it('getAuthStatusDisplay checking text matches authChecking translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: undefined };
    expect(getAuthStatusDisplay(settings).text).toBe(TRANSLATIONS.authChecking.en);
  });

  it('getAuthStatusDisplay check-failed text matches authCheckFailed translation (en)', () => {
    const settings: SyncPluginSettings = { ...DEFAULT_SETTINGS, lastPreflightStatus: 'auth_check_failed' };
    expect(getAuthStatusDisplay(settings).text).toBe(TRANSLATIONS.authCheckFailed.en);
  });

  it('SyncPluginSettings language field accepts en and zh', () => {
    const enSettings: SyncPluginSettings = { ...DEFAULT_SETTINGS, language: 'en' };
    const zhSettings: SyncPluginSettings = { ...DEFAULT_SETTINGS, language: 'zh' };
    expect(enSettings.language).toBe('en');
    expect(zhSettings.language).toBe('zh');
  });
});

describe('launchAuthLogin', () => {
  let originalPlatform: string;

  beforeEach(() => {
    originalPlatform = process.platform;
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('calls exec with Windows terminal command on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    launchAuthLogin();
    expect(exec).toHaveBeenCalledTimes(1);
    const cmd = (exec as any).mock.calls[0][0];
    expect(cmd).toContain('start cmd');
    expect(cmd).toContain('lark-cli auth login');
  });

  it('calls exec with macOS terminal command on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    launchAuthLogin();
    expect(exec).toHaveBeenCalledTimes(1);
    const cmd = (exec as any).mock.calls[0][0];
    expect(cmd).toContain('osascript');
    expect(cmd).toContain('lark-cli auth login');
  });

  it('calls exec with Linux terminal command on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    launchAuthLogin();
    expect(exec).toHaveBeenCalledTimes(1);
    const cmd = (exec as any).mock.calls[0][0];
    expect(cmd).toContain('x-terminal-emulator');
    expect(cmd).toContain('lark-cli auth login');
  });

  it('exec callback does not throw when terminal launch succeeds', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    (exec as any).mockImplementationOnce((_cmd: string, cb: (err: any) => void) => {
      expect(() => cb(null)).not.toThrow();
    });
    launchAuthLogin();
  });

  it('exec callback does not throw when terminal launch fails', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    (exec as any).mockImplementationOnce((_cmd: string, cb: (err: any) => void) => {
      expect(() => cb(new Error('exec failed'))).not.toThrow();
    });
    launchAuthLogin();
  });
});

describe('SyncSettingsTab - Authorize button', () => {
  function createTab(overrides: Partial<SyncPluginSettings>): { tab: SyncSettingsTab; containerEl: HTMLElement } {
    const app = new App();
    const plugin = {
      settings: { ...DEFAULT_SETTINGS, ...overrides },
      saveData: vi.fn(),
    };
    const onSettingsChange = vi.fn();
    const tab = new SyncSettingsTab(app, plugin, onSettingsChange);
    tab.display();
    return { tab, containerEl: (tab as any).containerEl };
  }

  it('shows Authorize button when status is auth_required', () => {
    const { containerEl } = createTab({ lastPreflightStatus: 'auth_required' });
    const button = containerEl.querySelector('button');
    expect(button).toBeTruthy();
    expect(button!.textContent).toBe('Authorize');
  });

  it('does not show Authorize button when status is ok', () => {
    const { containerEl } = createTab({ lastPreflightStatus: 'ok' });
    const button = containerEl.querySelector('button');
    expect(button).toBeFalsy();
  });

  it('does not show Authorize button when status is undefined', () => {
    const { containerEl } = createTab({ lastPreflightStatus: undefined });
    const button = containerEl.querySelector('button');
    expect(button).toBeFalsy();
  });

  it('does not show Authorize button when status is cli_not_found', () => {
    const { containerEl } = createTab({ lastPreflightStatus: 'cli_not_found' });
    const button = containerEl.querySelector('button');
    expect(button).toBeFalsy();
  });

  it('does not show Authorize button when status is auth_check_failed', () => {
    const { containerEl } = createTab({ lastPreflightStatus: 'auth_check_failed' });
    const button = containerEl.querySelector('button');
    expect(button).toBeFalsy();
  });

  it('Authorize button click calls launchAuthLogin', () => {
    const { containerEl } = createTab({ lastPreflightStatus: 'auth_required' });
    const button = containerEl.querySelector('button')!;
    button.click();
    expect(exec).toHaveBeenCalled();
  });
});
