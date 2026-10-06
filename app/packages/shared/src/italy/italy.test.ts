import { describe, expect, it } from 'vitest';
import {
  CODICE_FISCALE_SCAN_PATTERN,
  codiceFiscaleCheckChar,
  isValidCodiceFiscale,
  isValidPartitaIva,
  partitaIvaCheckDigit,
} from './index';

describe('codice fiscale', () => {
  it('accepts the canonical example', () => {
    expect(isValidCodiceFiscale('RSSMRA85T10A562S')).toBe(true);
  });

  it('normalizes case and whitespace', () => {
    expect(isValidCodiceFiscale(' rssmra85t10a562s ')).toBe(true);
    expect(isValidCodiceFiscale('RSS MRA 85T10 A562S')).toBe(true);
  });

  it('rejects a wrong check character', () => {
    expect(isValidCodiceFiscale('RSSMRA85T10A562T')).toBe(false);
  });

  it('rejects malformed values', () => {
    expect(isValidCodiceFiscale('')).toBe(false);
    expect(isValidCodiceFiscale('RSSMRA85T10A562')).toBe(false); // 15 chars
    expect(isValidCodiceFiscale('RSSMRA85Z10A562S')).toBe(false); // Z is not a month letter
    expect(isValidCodiceFiscale('12345678901')).toBe(false); // company-style numeric CF
  });

  it('accepts omocodic variants with a recomputed check character', () => {
    // Last digit of the municipality code 2 → N (omocodia substitution)
    const base = 'RSSMRA85T10A56N';
    const cf = base + codiceFiscaleCheckChar(base);
    expect(isValidCodiceFiscale(cf)).toBe(true);
  });

  it('finds candidates inside extracted page text', () => {
    const text = 'Dipendente ROSSI MARIO C.F. RSSMRA85T10A562S Matricola 0042';
    expect(text.match(CODICE_FISCALE_SCAN_PATTERN)).toEqual(['RSSMRA85T10A562S']);
  });
});

describe('partita IVA', () => {
  it('accepts a real registered VAT number', () => {
    expect(isValidPartitaIva('00159560366')).toBe(true); // Ferrari S.p.A.
  });

  it('computes the check digit', () => {
    expect(partitaIvaCheckDigit('0123456789')).toBe(7);
  });

  it('rejects wrong check digits and malformed values', () => {
    expect(isValidPartitaIva('00159560367')).toBe(false);
    expect(isValidPartitaIva('0015956036')).toBe(false);
    expect(isValidPartitaIva('IT00159560366')).toBe(false);
    expect(isValidPartitaIva('00000000000')).toBe(false);
  });
});
