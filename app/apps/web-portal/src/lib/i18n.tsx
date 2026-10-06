import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { it } from '../locales/it';
import { en } from '../locales/en';
import { es } from '../locales/es';

export type MessageKey = keyof typeof it;
export type Messages = Record<MessageKey, string>;

// The portal is used by HR and owners in Italy. Workers' languages (ro, ar, sq,
// uk, fr, zh…) live in the mobile app.
export const LOCALES = {
  it: { label: 'Italiano', tag: 'it-IT', messages: it as Messages },
  en: { label: 'English', tag: 'en-GB', messages: en },
  es: { label: 'Español', tag: 'es-ES', messages: es },
} as const;
export type Locale = keyof typeof LOCALES;

const STORAGE_KEY = 'fide.portal.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in LOCALES) return saved as Locale;
  } catch {
    // storage unavailable (private mode): fall through
  }
  const browser = navigator.language.slice(0, 2);
  return browser in LOCALES ? (browser as Locale) : 'it';
}

interface I18n {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: MessageKey, vars?: Record<string, string | number>): string;
  formatDateTime(value: string | Date, opts?: Intl.DateTimeFormatOptions): string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not persisted; fine
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const { messages, tag } = LOCALES[locale];
    return {
      locale,
      setLocale,
      t: (key, vars) => {
        let text = messages[key] ?? it[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
        return text;
      },
      formatDateTime: (v, opts = { dateStyle: 'medium', timeStyle: 'short' }) =>
        new Intl.DateTimeFormat(tag, { timeZone: 'Europe/Rome', ...opts }).format(typeof v === 'string' ? new Date(v) : v),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
