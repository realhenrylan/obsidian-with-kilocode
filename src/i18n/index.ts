// src/i18n/index.ts
// 翻译系统：key 查找（点号分隔）+ {{param}} 替换
// 缺失 key 返回 key 本身（便于发现未接入的文本）

import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

export type Locale = 'en' | 'zh' | 'ja' | 'ko';

const resources: Record<Locale, any> = {
  en,
  zh,
  ja,
  ko,
};

let currentLocale: Locale = 'en';

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string>): string {
  const keys = key.split('.');
  let value: unknown = resources[currentLocale];

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] || '');
  }

  return value;
}

export function detectLocale(): Locale {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('zh')) {
    return 'zh';
  }
  if (lang.startsWith('ja')) {
    return 'ja';
  }
  if (lang.startsWith('ko')) {
    return 'ko';
  }
  return 'en';
}

export function initI18n(locale?: Locale): void {
  setLocale(locale || detectLocale());
}
