Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'en-US' },
  writable: true,
  configurable: true,
});

import { t, setLocale, getLocale, detectLocale } from '../../src/i18n/index';

describe('i18n', () => {
  beforeEach(() => {
    setLocale('en');
  });

  test('should get translation', () => {
    expect(t('chat.send')).toBe('Send');
  });

  test('should get nested translation', () => {
    expect(t('settings.title')).toBe('KiloCode Settings');
  });

  test('should return key if translation not found', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  test('should replace parameters', () => {
    const result = t('errors.cliStartFailed', { error: 'test error' });
    expect(result).toContain('test error');
  });

  test('should set and get locale', () => {
    setLocale('zh');
    expect(getLocale()).toBe('zh');
  });

  test('should get Chinese translation', () => {
    setLocale('zh');
    expect(t('chat.send')).toBe('发送');
  });

  test('should detect locale', () => {
    (navigator as any).language = 'en-US';
    expect(detectLocale()).toBe('en');

    (navigator as any).language = 'zh-CN';
    expect(detectLocale()).toBe('zh');
  });
});
