// Every locale must have every key, the same {placeholders}, and no empty text.
import { describe, expect, it as test } from 'vitest';
import { ar } from '../i18n/app/ar';
import { en } from '../i18n/app/en';
import { es } from '../i18n/app/es';
import { fr } from '../i18n/app/fr';
import { it } from '../i18n/app/it';
import { ro } from '../i18n/app/ro';
import { sq } from '../i18n/app/sq';
import { uk } from '../i18n/app/uk';
import { zh } from '../i18n/app/zh';

const locales = { en, es, ro, ar, sq, uk, fr, zh } as const;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('app translations', () => {
  for (const [code, messages] of Object.entries(locales)) {
    test(`${code} matches the Italian source`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(it).sort());
      for (const [key, source] of Object.entries(it)) {
        const text = (messages as Record<string, string>)[key];
        expect(text.trim(), `${code}.${key}`).not.toBe('');
        expect(placeholders(text), `${code}.${key}`).toEqual(placeholders(source));
      }
    });
  }
});
