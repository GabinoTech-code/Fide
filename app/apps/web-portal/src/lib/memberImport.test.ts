import { codiceFiscaleCheckChar } from '@fide/shared';
import { describe, expect, it } from 'vitest';
import { decodeCsv, detectDelimiter, failedRow, importPayload, mapColumns, parseCsv, planImport, TEMPLATE_CSV } from './memberImport';
import type { Member, Site } from './types';

const cf = (first15: string) => first15 + codiceFiscaleCheckChar(first15);
const LAURA = cf('FRRLRA92E41F205');
const PIERO = cf('NREPRI80A01H501');
const MARCO = 'CLMMRC88M03D612C';

const sites: Site[] = [
  { id: 's-mi', company_id: 'c', name: 'Sede Milano', address: null, latitude: null, longitude: null, radius_m: 100, geo_enabled: false },
  { id: 's-ss', company_id: 'c', name: 'Magazzino Sesto', address: null, latitude: null, longitude: null, radius_m: 100, geo_enabled: false },
];
const members = [
  {
    id: 'm-marco',
    full_name: 'Marco Colombo',
    member_identities: { email: 'marco.colombo@aurora.test', codice_fiscale: MARCO },
  },
] as unknown as Member[];

describe('parseCsv', () => {
  it('reads Italian Excel exports: BOM, semicolons, CRLF, quotes', () => {
    const text = '﻿Nome;Note\r\n"Rossi; Mario";"disse ""ciao"""\r\n"su due\nrighe";x\r\n\r\n;\r\n';
    expect(parseCsv(text)).toEqual([
      ['Nome', 'Note'],
      ['Rossi; Mario', 'disse "ciao"'],
      ['su due\nrighe', 'x'],
    ]);
  });

  it('detects the delimiter from the header', () => {
    expect(detectDelimiter('a,b,c\n1;2')).toBe(',');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('"a;b",c,d')).toBe(',');
    expect(detectDelimiter('solo')).toBe(';');
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('decodes UTF-8 and Windows-1252 (Excel on Windows) alike', () => {
    expect(decodeCsv(new TextEncoder().encode('Nome\nNicolò Mirò'))).toBe('Nome\nNicolò Mirò');
    // "Nicolò" in Windows-1252: ò = 0xF2, invalid as UTF-8.
    expect(decodeCsv(new Uint8Array([0x4e, 0x69, 0x63, 0x6f, 0x6c, 0xf2]))).toBe('Nicolò');
  });

  it('handles a last line without newline and old Mac line endings', () => {
    expect(parseCsv('a;b\r1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('mapColumns', () => {
  it('recognises Italian, English and Spanish headers, case and accents aside', () => {
    expect(mapColumns(['Cognome', 'Nome', 'Cod. Fiscale', 'E-Mail', 'N. Matricola', 'Unità locale'])).toEqual({
      lastName: 0,
      firstName: 1,
      codiceFiscale: 2,
      email: 3,
      employeeNumber: 4,
      site: 5,
    });
    expect(mapColumns(['Full name', 'Tax code', 'email*'])).toEqual({ fullName: 0, codiceFiscale: 1, email: 2 });
    expect(mapColumns(['Nombre y apellidos', 'Correo electrónico'])).toEqual({ fullName: 0, email: 1 });
  });
});

describe('planImport', () => {
  const plan = (csv: string) => planImport(parseCsv(csv), { members, sites });

  it('builds rows from first/last name columns and normalises values', () => {
    const p = plan(`Nome;Cognome;Email;Codice fiscale;Sede;Matricola\nLaura;Ferri; Laura.Ferri@Aurora.TEST ;${LAURA.toLowerCase().slice(0, 6)} ${LAURA.toLowerCase().slice(6)};sede milano;A-17`);
    expect(p.missingName).toBe(false);
    expect(p.rows).toEqual([
      expect.objectContaining({
        line: 2,
        fullName: 'Laura Ferri',
        email: 'laura.ferri@aurora.test',
        codiceFiscale: LAURA,
        siteId: 's-mi',
        employeeNumber: 'A-17',
        status: 'ready',
        issues: [],
        noEmail: false,
      }),
    ]);
  });

  it('flags every problem of a row, with file line numbers', () => {
    const p = plan(
      [
        'Nome e cognome;E-mail;CF;Sede',
        `Piero Neri;;${PIERO};`, // ready, but cannot be invited
        ';x@y.it;;', // no name
        'Ugo;not-an-email;RSSMRA85T10A562X;Roma', // bad e-mail, bad check char, unknown site
        `Piero Bis;;${PIERO};`, // same CF as line 2
        `Marco C.;;${MARCO};`, // already in the company
      ].join('\n'),
    );
    expect(p.rows.map((r) => [r.line, r.status, r.issues])).toEqual([
      [2, 'ready', []],
      [3, 'error', ['name_missing']],
      [4, 'error', ['email_invalid', 'cf_invalid', 'site_unknown']],
      [5, 'error', ['duplicate_in_file']],
      [6, 'exists', []],
    ]);
    expect(p.rows[0].noEmail).toBe(true);
    expect(p.rows[3].duplicateOf).toBe(2);
    expect(p.rows[4].existingName).toBe('Marco Colombo');
  });

  it('matches existing employees by e-mail too', () => {
    const p = plan('Nominativo;Email\nMarco;MARCO.COLOMBO@aurora.test');
    expect(p.rows[0]).toMatchObject({ status: 'exists', existingName: 'Marco Colombo' });
  });

  it('refuses files without a usable name column', () => {
    expect(plan('Nome;Email\nLaura;l@x.it')).toMatchObject({ missingName: true, rows: [] });
    expect(plan('Email;CF\nl@x.it;')).toMatchObject({ missingName: true });
  });

  it('accepts the downloadable template as is', () => {
    const p = planImport(parseCsv(TEMPLATE_CSV), { members: [], sites: [{ ...sites[0], name: 'Sede principale' }] });
    expect(p.rows.map((r) => r.status)).toEqual(['ready']);
  });
});

describe('server errors', () => {
  it('maps import_row_failed back to the file line', () => {
    const p = planImport(parseCsv(`Nominativo;CF\nLaura;${LAURA}\nPiero;${PIERO}`), { members: [], sites });
    const ready = p.rows.filter((r) => r.status === 'ready');
    expect(importPayload(ready)).toEqual([
      { full_name: 'Laura', email: null, codice_fiscale: LAURA, site_id: null, employee_number: null },
      { full_name: 'Piero', email: null, codice_fiscale: PIERO, site_id: null, employee_number: null },
    ]);
    const err = { message: 'import_row_failed', details: JSON.stringify({ row: 2, sqlstate: '23505', constraint: 'member_identities_cf' }) };
    expect(failedRow(err, ready)).toEqual({ line: 3, reason: 'cf_taken' });
    expect(failedRow({ message: 'import_row_failed', details: '{"row":1,"sqlstate":"23503","constraint":null}' }, ready)).toEqual({ line: 2, reason: 'site' });
    expect(failedRow({ message: 'forbidden' }, ready)).toBeNull();
    expect(failedRow({ message: 'import_row_failed', details: 'garbage' }, ready)).toBeNull();
  });
});
