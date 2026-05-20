import en from './locales/en.json';
import zh from './locales/zh.json';

export type Locale = 'en' | 'zh';

const resources: Record<Locale, any> = {
  en,
  zh,
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
  let value: any = resources[currentLocale];

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
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
  return 'en';
}

export function initI18n(locale?: Locale): void {
  setLocale(locale || detectLocale());
}
