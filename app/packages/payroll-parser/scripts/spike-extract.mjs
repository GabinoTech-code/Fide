#!/usr/bin/env node
// Spike S3 (docs/adr/0004): can we find the codice fiscale on every payslip page?
//   node app/packages/payroll-parser/scripts/spike-extract.mjs cedolini.pdf [--employer 01234567897] [--text]
// Runs locally; the PDF never leaves this computer. Prints, per page, the
// checksum-valid codici fiscali found as-is and after joining split text items.
// (Self-contained on purpose: same algorithm as @fide/shared/italy.)
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const employer = args.includes('--employer') ? args[args.indexOf('--employer') + 1]?.toUpperCase() : null;
const showText = args.includes('--text');
if (!file) {
  console.error('usage: spike-extract.mjs <file.pdf> [--employer <CF/P.IVA>] [--text]');
  process.exit(2);
}

const ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
const SCAN = /[A-Z]{6}[0-9LMNP-V]{2}[ABCDEHLMPRST][0-9LMNP-V]{2}[A-Z][0-9LMNP-V]{3}[A-Z]/g;
const valid = (cf) => {
  let s = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf.charCodeAt(i);
    const v = c <= 57 ? c - 48 : c - 65;
    s += i % 2 === 0 ? ODD[v] : v;
  }
  return String.fromCharCode(65 + (s % 26)) === cf[15];
};
const scan = (text) => [...new Set([...text.matchAll(SCAN)].map((m) => m[0]))].filter(valid);

const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise;
console.log(`${file}: ${pdf.numPages} pages\n`);
const summary = { withCf: 0, joinedOnly: 0, none: 0, multiple: 0, noText: 0 };

for (let p = 1; p <= pdf.numPages; p++) {
  const content = await (await pdf.getPage(p)).getTextContent();
  const text = content.items.map((i) => ('str' in i ? i.str : '')).join(' ').toUpperCase();
  if (!text.trim()) summary.noText++;
  const direct = scan(text).filter((c) => c !== employer);
  const joined = scan(text.replace(/\s+/g, '')).filter((c) => c !== employer && !direct.includes(c));
  const all = [...direct, ...joined];
  if (all.length === 0) summary.none++;
  else if (all.length > 1) summary.multiple++;
  else summary.withCf++;
  if (direct.length === 0 && joined.length > 0) summary.joinedOnly++;
  // Print only a masked CF: enough to judge the result, safe to paste into the ADR.
  const mask = (cf) => `${cf.slice(0, 3)}***********${cf.slice(14)}`;
  console.log(
    `page ${String(p).padStart(3)}: ${all.length ? all.map(mask).join(', ') : '— no CF (continuation?)'}` +
      (joined.length ? `   [joined: ${joined.map(mask).join(', ')}]` : '') +
      (text.trim() ? '' : '   [NO TEXT LAYER: scanned page?]'),
  );
  if (showText) console.log(`   ${text.slice(0, 400)}\n`);
}

console.log(`\nsummary: ${JSON.stringify(summary)}`);
console.log('Go if every first page of a payslip has exactly one CF and continuation pages have none.');
