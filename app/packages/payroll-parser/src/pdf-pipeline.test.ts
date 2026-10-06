// The portal pipeline on a real PDF: pdf-lib builds a bulk payroll file,
// pdf.js extracts page texts, splitPayroll assigns pages, pdf-lib cuts one PDF
// per employee.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { expect, it } from 'vitest';
import { splitPayroll } from './index';

async function bulkPayroll(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 18, size: 11, font }));
  }
  return doc.save();
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  const texts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return texts;
}

it('splits a bulk payroll PDF into one PDF per employee', async () => {
  const header = 'OFFICINE AURORA S.R.L. - P.IVA 01234567897 - CEDOLINO OTTOBRE 2026';
  const bytes = await bulkPayroll([
    [header, 'Dipendente: COLOMBO MARCO', 'Codice fiscale: CLMMRC88M03D612C', 'Netto in busta 1.734,00'],
    [header, 'Dettaglio ritenute (segue)', 'IRPEF 312,00'],
    [header, 'Dipendente: GALLI ANNA', 'Codice fiscale: GLLNNA95S48A944C', 'Netto in busta 1.598,00'],
  ]);

  const texts = await pageTexts(bytes);
  const { documents, issues } = splitPayroll(
    texts,
    [
      { memberId: 'm-marco', codiceFiscale: 'CLMMRC88M03D612C' },
      { memberId: 'm-anna', codiceFiscale: 'GLLNNA95S48A944C' },
    ],
    { employerCodes: ['01234567897'] },
  );
  expect(issues).toEqual([]);
  expect(documents.map((d) => [d.memberId, d.pages])).toEqual([
    ['m-marco', [1, 2]],
    ['m-anna', [3]],
  ]);

  const source = await PDFDocument.load(bytes);
  for (const d of documents) {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(source, d.pages.map((p) => p - 1));
    copied.forEach((p) => out.addPage(p));
    const split = await out.save();
    const splitTexts = await pageTexts(split);
    expect(splitTexts).toHaveLength(d.pages.length);
    expect(splitTexts[0]).toContain(d.codiceFiscale);
  }
});
