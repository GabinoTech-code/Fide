// Employee import from a spreadsheet (CSV exported by Excel, Zucchetti,
// TeamSystem…). Everything is checked here first so HR sees every problem at
// once; the server re-validates each row in import_members(), all-or-nothing.
import { isValidCodiceFiscale, normalizeCodiceFiscale } from '@fide/shared';
import type { Member, Site } from './types';

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Excel on Windows saves "CSV (delimitato)" as Windows-1252, not UTF-8: decoding
 * it as UTF-8 would turn "Nicolò" into "Nicol�". Strict UTF-8 first, then 1252.
 */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Italian Excel writes ";" (the comma is the decimal separator); others write "," or tabs. */
export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0].replace(/"[^"]*"/g, '');
  let best: ';' | ',' | '\t' = ';';
  let bestCount = 0;
  for (const d of [';', ',', '\t'] as const) {
    const n = firstLine.split(d).length - 1;
    if (n > bestCount) [best, bestCount] = [d, n];
  }
  return best;
}

/** RFC 4180 with the usual real-world slack: BOM, any newline style, quoted delimiters/newlines, "" escapes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type Column = 'fullName' | 'firstName' | 'lastName' | 'email' | 'codiceFiscale' | 'employeeNumber' | 'site';

const ALIASES: Record<Column, string[]> = {
  fullName: ['nome e cognome', 'cognome e nome', 'cognome nome', 'nome cognome', 'nominativo', 'dipendente', 'nome completo', 'full name', 'name', 'nombre completo', 'nombre y apellidos'],
  firstName: ['nome', 'first name', 'given name', 'nombre'],
  lastName: ['cognome', 'last name', 'surname', 'family name', 'apellidos', 'apellido'],
  email: ['email', 'e-mail', 'e mail', 'mail', 'posta elettronica', 'indirizzo email', 'indirizzo e-mail', 'correo', 'correo electronico'],
  codiceFiscale: ['codice fiscale', 'cod. fiscale', 'cod fiscale', 'c.f.', 'cf', 'codice_fiscale', 'fiscal code', 'tax code', 'tax id'],
  employeeNumber: ['matricola', 'n. matricola', 'n matricola', 'numero matricola', 'codice dipendente', 'cod. dipendente', 'employee number', 'employee id', 'badge', 'numero de empleado'],
  site: ['sede', 'sede di lavoro', 'filiale', 'unita locale', 'unita produttiva', 'centro di lavoro', 'site', 'location', 'centro de trabajo'],
};

export const normalizeHeader = (h: string) =>
  h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[*:]+$/, '')
    .replace(/[_\s]+/g, ' ')
    .trim();

export function mapColumns(header: string[]): Partial<Record<Column, number>> {
  const out: Partial<Record<Column, number>> = {};
  header.forEach((raw, index) => {
    const h = normalizeHeader(raw);
    const column = (Object.keys(ALIASES) as Column[]).find((c) => ALIASES[c].some((a) => normalizeHeader(a) === h));
    if (column && out[column] === undefined) out[column] = index;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type RowIssue =
  | 'name_missing'
  | 'name_too_long'
  | 'email_invalid'
  | 'cf_invalid'
  | 'number_too_long'
  | 'site_unknown'
  | 'duplicate_in_file';

export interface ImportRow {
  /** Line in the file, header = 1: what HR sees in the spreadsheet. */
  line: number;
  fullName: string;
  email: string | null;
  codiceFiscale: string | null;
  employeeNumber: string | null;
  siteId: string | null;
  siteName: string | null;
  status: 'ready' | 'exists' | 'error';
  issues: RowIssue[];
  /** Ready but without e-mail: cannot be invited until one is added. */
  noEmail: boolean;
  /** For 'exists': who already has this CF or e-mail. */
  existingName?: string;
  /** For 'duplicate_in_file': the earlier line. */
  duplicateOf?: number;
}

export interface ImportPlan {
  columns: Partial<Record<Column, number>>;
  /** No way to build a name: the file cannot be imported. */
  missingName: boolean;
  rows: ImportRow[];
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MAX_IMPORT_ROWS = 1000;

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

export function planImport(table: string[][], ctx: { members: Member[]; sites: Site[] }): ImportPlan {
  const [header = [], ...body] = table;
  const columns = mapColumns(header);
  const missingName = columns.fullName === undefined && (columns.firstName === undefined || columns.lastName === undefined);

  const byCf = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const m of ctx.members) {
    const identity = one(m.member_identities);
    if (identity?.codice_fiscale) byCf.set(identity.codice_fiscale, m.full_name);
    if (identity?.email) byEmail.set(identity.email, m.full_name);
  }
  const siteByName = new Map(ctx.sites.map((s) => [normalizeHeader(s.name), s]));
  const seenCf = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  const rows = body.map((cells, i): ImportRow => {
    const line = i + 2;
    const cell = (c: Column) => (columns[c] === undefined ? '' : (cells[columns[c]!] ?? '').trim());
    const fullName = (cell('fullName') || [cell('firstName'), cell('lastName')].filter(Boolean).join(' ')).replace(/\s+/g, ' ');
    const email = cell('email').toLowerCase() || null;
    const codiceFiscale = cell('codiceFiscale') ? normalizeCodiceFiscale(cell('codiceFiscale')) : null;
    const employeeNumber = cell('employeeNumber') || null;
    const siteName = cell('site') || null;
    const site = siteName ? siteByName.get(normalizeHeader(siteName)) : undefined;

    const issues: RowIssue[] = [];
    if (!fullName) issues.push('name_missing');
    else if (fullName.length > 200) issues.push('name_too_long');
    if (email && !EMAIL.test(email)) issues.push('email_invalid');
    if (codiceFiscale && !isValidCodiceFiscale(codiceFiscale)) issues.push('cf_invalid');
    if (employeeNumber && employeeNumber.length > 40) issues.push('number_too_long');
    if (siteName && !site) issues.push('site_unknown');

    let duplicateOf: number | undefined;
    if (codiceFiscale) duplicateOf ??= seenCf.get(codiceFiscale);
    if (email) duplicateOf ??= seenEmail.get(email);
    if (duplicateOf !== undefined) issues.push('duplicate_in_file');
    if (codiceFiscale && !seenCf.has(codiceFiscale)) seenCf.set(codiceFiscale, line);
    if (email && !seenEmail.has(email)) seenEmail.set(email, line);

    const existingName = (codiceFiscale && byCf.get(codiceFiscale)) || (email && byEmail.get(email)) || undefined;
    const status = issues.length ? 'error' : existingName ? 'exists' : 'ready';
    return {
      line,
      fullName,
      email,
      codiceFiscale,
      employeeNumber,
      siteId: site?.id ?? null,
      siteName,
      status,
      issues,
      noEmail: status === 'ready' && !email,
      ...(existingName ? { existingName } : {}),
      ...(duplicateOf !== undefined ? { duplicateOf } : {}),
    };
  });

  return { columns, missingName, rows: missingName ? [] : rows };
}

/** Payload for import_members(), in the same order as `ready`. */
export function importPayload(ready: ImportRow[]) {
  return ready.map((r) => ({
    full_name: r.fullName,
    email: r.email,
    codice_fiscale: r.codiceFiscale,
    site_id: r.siteId,
    employee_number: r.employeeNumber,
  }));
}

/** import_row_failed DETAIL → which file line failed and why. */
export function failedRow(err: unknown, ready: ImportRow[]): { line: number; reason: 'email_taken' | 'cf_taken' | 'invalid' | 'site' | 'other' } | null {
  const e = err as { message?: string; details?: string };
  if (!e?.message?.includes('import_row_failed') || !e.details) return null;
  try {
    const d = JSON.parse(e.details) as { row: number; sqlstate: string; constraint: string | null };
    const row = ready[d.row - 1];
    if (!row) return null;
    const reason =
      d.constraint === 'member_identities_email'
        ? 'email_taken'
        : d.constraint === 'member_identities_cf'
          ? 'cf_taken'
          : d.sqlstate === '23503'
            ? 'site'
            : d.sqlstate === '23514' || d.sqlstate === '23502' || d.sqlstate === '22P02'
              ? 'invalid'
              : 'other';
    return { line: row.line, reason };
  } catch {
    return null;
  }
}

export const TEMPLATE_CSV =
  '﻿Nome e cognome;E-mail;Codice fiscale;Matricola;Sede\r\n' + 'Mario Rossi;mario.rossi@azienda.it;RSSMRA85T10A562S;001;Sede principale\r\n';
