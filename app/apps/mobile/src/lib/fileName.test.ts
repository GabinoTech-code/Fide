import { describe, expect, it } from 'vitest';
import { pdfName } from './fileName';

describe('pdfName', () => {
  it('keeps letters, digits and accents', () => {
    expect(pdfName('Cedolino settembre 2026')).toBe('Cedolino settembre 2026.pdf');
    expect(pdfName('Certificazione Unica 2026 – Nicolò')).toBe('Certificazione Unica 2026 Nicolò.pdf');
  });

  it('drops path separators and characters a file system refuses', () => {
    expect(pdfName('../../etc/passwd')).toBe('.. .. etc passwd.pdf');
    expect(pdfName('a:b*c?"d<e>f|g\u0000h')).toBe('a b c d e f g h.pdf');
  });

  it('never returns an empty or overlong name', () => {
    expect(pdfName('///')).toBe('documento.pdf');
    expect(pdfName('x'.repeat(200))).toHaveLength(84);
  });
});
