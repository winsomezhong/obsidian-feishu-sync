import { describe, it, expect } from 'vitest';
import { TRANSLATIONS, t, LOCALE_KEYS } from './index';

describe('TRANSLATIONS', () => {
  const requiredKeys = [
    'settingsTitle',
    'cliInstallStatus',
    'cliStatusDesc',
    'cliReady',
    'cliNotReady',
    'cliChecking',
    'installGuide',
    'authStatus',
    'authStatusDesc',
    'authAuthorized',
    'authNotAuthorized',
    'authChecking',
    'authCheckFailed',
    'authorize',
    'refresh',
    'refreshing',
    'refreshStatus',
    'refreshDesc',
    'folderPath',
    'folderPathDesc',
    'syncOnSave',
    'syncOnSaveDesc',
    'language',
    'languageDesc',
    'authCommandCopied',
  ];

  it('has all required translation keys', () => {
    for (const key of requiredKeys) {
      expect(TRANSLATIONS).toHaveProperty(key);
    }
  });

  it('each key has en and zh translations', () => {
    for (const [key, value] of Object.entries(TRANSLATIONS)) {
      expect(value).toHaveProperty('en');
      expect(value).toHaveProperty('zh');
      expect(typeof value.en).toBe('string');
      expect(typeof value.zh).toBe('string');
      expect(value.en.length).toBeGreaterThan(0);
      expect(value.zh.length).toBeGreaterThan(0);
    }
  });

  it('matches exact required key count (no missing keys)', () => {
    expect(Object.keys(TRANSLATIONS).length).toBe(requiredKeys.length);
  });
});

describe('t()', () => {
  it('returns English translation for en locale', () => {
    expect(t('settingsTitle', 'en')).toBe('Feishu Sync Settings');
    expect(t('cliReady', 'en')).toBe('lark-cli: ready');
    expect(t('authAuthorized', 'en')).toBe('Authorized');
  });

  it('returns Chinese translation for zh locale', () => {
    expect(t('settingsTitle', 'zh')).toBe('飞书同步设置');
    expect(t('cliReady', 'zh')).toBe('lark-cli: 就绪');
    expect(t('authAuthorized', 'zh')).toBe('已授权');
  });

  it('falls back to English for unknown keys', () => {
    const result = t('nonexistent_key' as any, 'zh');
    expect(result).toBe('nonexistent_key');
  });

  it('falls back to English for unknown keys with en locale', () => {
    const result = t('nonexistent_key' as any, 'en');
    expect(result).toBe('nonexistent_key');
  });
});

describe('LOCALE_KEYS', () => {
  it('defines en and zh', () => {
    expect(LOCALE_KEYS).toEqual(['en', 'zh']);
  });
});
