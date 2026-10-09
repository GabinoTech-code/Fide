import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGES, type SupportedLanguage } from '../types';
import { ar } from './ar';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { ro } from './ro';
import { sq } from './sq';
import { uk } from './uk';
import { zh } from './zh';

export type AppKey = keyof typeof it;
export type AppMessages = Record<AppKey, string>;

export const catalogs: Record<SupportedLanguage, AppMessages> = { it, en, es, ro, ar, sq, uk, fr, zh };

const TAGS: Record<SupportedLanguage, string> = {
  it: 'it-IT', es: 'es-ES', en: 'en-GB', ro: 'ro-RO', ar: 'ar-MA', sq: 'sq-AL', uk: 'uk-UA', fr: 'fr-FR', zh: 'zh-CN',
};
const STORAGE_KEY = 'fide.language';

export function translate(lang: SupportedLanguage, key: AppKey, vars?: Record<string, string | number>): string {
  let text = catalogs[lang][key] ?? it[key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

interface I18n {
  lang: SupportedLanguage;
  setLang(lang: SupportedLanguage): void;
  t(key: AppKey, vars?: Record<string, string | number>): string;
  time(iso: string | Date): string;
  date(iso: string | Date): string;
  /** Any other date format, in the app language. */
  format(iso: string | Date, options: Intl.DateTimeFormatOptions): string;
  rtl: boolean;
}

const I18nContext = createContext<I18n | null>(null);

function deviceLanguage(): SupportedLanguage {
  // Intl is built into Hermes: no native module needed.
  const code = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2);
  return code in catalogs ? (code as SupportedLanguage) : 'it';
}

export function AppI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<SupportedLanguage>(deviceLanguage);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && saved in catalogs) setLangState(saved as SupportedLanguage);
    });
  }, []);

  const setLang = useCallback((next: SupportedLanguage) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18n>(() => {
    const tag = TAGS[lang];
    return {
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      time: (v) => new Date(v).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' }),
      date: (v) => new Date(v).toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric' }),
      format: (v, options) => new Date(v).toLocaleString(tag, options),
      rtl: LANGUAGES.find((l) => l.code === lang)?.direction === 'rtl',
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT outside AppI18nProvider');
  return ctx;
}
