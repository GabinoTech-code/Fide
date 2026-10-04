import { SupportedLanguage, TranslationStrings, LANGUAGES } from './types';
import { it } from './locales/it';
import { es } from './locales/es';
import { en } from './locales/en';
import { ro } from './locales/ro';
import { ar } from './locales/ar';
import { sq } from './locales/sq';
import { uk } from './locales/uk';
import { fr } from './locales/fr';
import { zh } from './locales/zh';

export * from './types';

export const DEFAULT_LANGUAGE: SupportedLanguage = 'it';

export const translations: Record<SupportedLanguage, TranslationStrings> = {
  it,
  es,
  en,
  ro,
  ar,
  sq,
  uk,
  fr,
  zh,
};

export function getTranslation(lang: SupportedLanguage): TranslationStrings {
  return translations[lang] || translations[DEFAULT_LANGUAGE];
}

const localeMap: Record<SupportedLanguage, string> = {
  it: 'it-IT',
  es: 'es-ES',
  en: 'en-US',
  ro: 'ro-RO',
  ar: 'ar-MA',
  sq: 'sq-AL',
  uk: 'uk-UA',
  fr: 'fr-FR',
  zh: 'zh-CN',
};

export function formatLocalizedDate(date: Date, lang: SupportedLanguage): string {
  const locale = localeMap[lang] || 'it-IT';
  try {
    const formatted = date.toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return date.toDateString();
  }
}

export function formatLocalizedShortDate(date: Date, lang: SupportedLanguage): string {
  const locale = localeMap[lang] || 'it-IT';
  try {
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return `${date.getDate()}/${date.getMonth() + 1}`;
  }
}
