// Splits a bulk payroll PDF (Zucchetti, TeamSystem, …) into per-employee page
// groups by codice fiscale. Runs in HR's browser: the input is the text of each
// page (pdf.js), the output says which pages belong to whom. Encryption happens
// afterwards with @fide/crypto; nothing here touches the network.
import { CODICE_FISCALE_SCAN_PATTERN, isValidCodiceFiscale } from '@fide/shared';

export interface KnownEmployee {
  memberId: string;
  codiceFiscale: string;
}

export interface EmployeeDocument {
  memberId: string;
  codiceFiscale: string;
  /** 1-based page numbers, in order. */
  pages: number[];
  /** Pages assigned only because they follow a matched page (no CF printed on them). */
  continuationPages: number[];
}

export type PageIssue =
  /** No CF of a known employee and no preceding matched page. */
  | { page: number; kind: 'unassigned' }
  /** CFs of several known employees on one page. */
  | { page: number; kind: 'ambiguous'; codiciFiscali: string[] }
  /** A valid CF that belongs to nobody in the company (new hire not invited yet?). */
  | { page: number; kind: 'unknown_employee'; codiciFiscali: string[] };

export interface SplitResult {
  documents: EmployeeDocument[];
  issues: PageIssue[];
  pageCount: number;
}

export interface SplitOptions {
  /** CF / P.IVA of the employer, printed on every page; never an employee. */
  employerCodes?: string[];
  /** Treat pages without a CF as continuation of the previous employee (default true). */
  continuationPages?: boolean;
}

/**
 * Finds checksum-valid codici fiscali in page text. pdf.js often splits a CF
 * across text items ("RSSMRA85 T10A562S"), so the text is scanned both as-is
 * and with all whitespace removed.
 */
export function findCodiciFiscali(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  for (const candidate of [upper, upper.replace(/\s+/g, '')]) {
    for (const match of candidate.matchAll(CODICE_FISCALE_SCAN_PATTERN)) {
      if (isValidCodiceFiscale(match[0])) found.add(match[0]);
    }
  }
  return [...found];
}

export function splitPayroll(pageTexts: string[], employees: KnownEmployee[], options: SplitOptions = {}): SplitResult {
  const byCf = new Map(employees.map((e) => [e.codiceFiscale.toUpperCase(), e]));
  const employer = new Set((options.employerCodes ?? []).map((c) => c.toUpperCase()));
  const allowContinuation = options.continuationPages ?? true;

  const docs = new Map<string, EmployeeDocument>();
  const issues: PageIssue[] = [];
  let previous: EmployeeDocument | null = null;

  pageTexts.forEach((text, index) => {
    const page = index + 1;
    const codes = findCodiciFiscali(text).filter((cf) => !employer.has(cf));
    const known = codes.filter((cf) => byCf.has(cf));
    const unknown = codes.filter((cf) => !byCf.has(cf));

    if (known.length === 1) {
      const employee = byCf.get(known[0])!;
      let doc = docs.get(employee.memberId);
      if (!doc) {
        doc = { memberId: employee.memberId, codiceFiscale: employee.codiceFiscale, pages: [], continuationPages: [] };
        docs.set(employee.memberId, doc);
      }
      doc.pages.push(page);
      previous = doc;
      return;
    }

    if (known.length > 1) {
      issues.push({ page, kind: 'ambiguous', codiciFiscali: known });
    } else if (unknown.length > 0) {
      issues.push({ page, kind: 'unknown_employee', codiciFiscali: unknown });
    } else if (allowContinuation && previous) {
      previous.pages.push(page);
      previous.continuationPages.push(page);
      return;
    } else {
      issues.push({ page, kind: 'unassigned' });
    }
    previous = null;
  });

  return { documents: [...docs.values()], issues, pageCount: pageTexts.length };
}
