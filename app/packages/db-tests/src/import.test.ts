// import_members(): the portal's CSV import. All-or-nothing, HR only, and every
// row goes through add_member()'s validation.
import { codiceFiscaleCheckChar } from '@fide/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed, type Session } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, sites } = seed;
const cf = (first15: string) => first15 + codiceFiscaleCheckChar(first15);
const LAURA = cf('FRRLRA92E41F205');
const PIERO = cf('NREPRI80A01H501');

const importRows = (s: Session, rows: unknown, company: string = seed.aurora) =>
  s.value<number>(`select public.import_members($1, $2::jsonb)`, [company, JSON.stringify(rows)]);
const importError = (s: Session, rows: unknown, company: string = seed.aurora) =>
  s.error(`select public.import_members($1, $2::jsonb)`, [company, JSON.stringify(rows)]);

describe('import_members', () => {
  it('adds every row as an invited employee, normalised like add_member', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const n = await importRows(s, [
        { full_name: '  Laura Ferri ', email: ' Laura.Ferri@Aurora.TEST ', codice_fiscale: LAURA.toLowerCase().replace(/(.{6})/, '$1 '), site_id: sites.milano, employee_number: 'A-17' },
        { full_name: 'Piero Neri', codice_fiscale: PIERO },
      ]);
      expect(n).toBe(2);
      const rows = await s.rows(
        `select m.full_name, m.role, m.status, m.site_id, m.employee_number, i.email, i.codice_fiscale
         from public.members m join public.member_identities i on i.member_id = m.id
         where m.full_name in ('Laura Ferri', 'Piero Neri') order by m.full_name`,
      );
      expect(rows).toEqual([
        { full_name: 'Laura Ferri', role: 'employee', status: 'invited', site_id: sites.milano, employee_number: 'A-17', email: 'laura.ferri@aurora.test', codice_fiscale: LAURA },
        { full_name: 'Piero Neri', role: 'employee', status: 'invited', site_id: null, employee_number: null, email: null, codice_fiscale: PIERO },
      ]);
    });
  });

  it('is all-or-nothing and names the failing row without echoing its data', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const err = await importError(s, [
        { full_name: 'Laura Ferri', codice_fiscale: LAURA },
        { full_name: 'Marco Bis', codice_fiscale: 'CLMMRC88M03D612C' }, // Marco Colombo's CF
      ]);
      expect(err.message).toContain('import_row_failed');
      expect(JSON.parse(err.detail!)).toEqual({ row: 2, sqlstate: '23505', constraint: 'member_identities_cf' });
      expect(err.detail).not.toContain('CLMMRC');
      expect(await s.value(`select count(*)::int from public.members where full_name = 'Laura Ferri'`)).toBe(0);
    });
  });

  it('reports the reason for each kind of bad row', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const reason = async (row: unknown) => JSON.parse((await importError(s, [row])).detail!) as { row: number; sqlstate: string; constraint: string | null };
      expect((await reason({ full_name: 'X', codice_fiscale: 'RSSMRA85T10A562X' })).sqlstate).toBe('23514'); // bad check char
      expect((await reason({ full_name: 'X', email: 'not-an-email' })).sqlstate).toBe('23514');
      expect((await reason({ full_name: '   ' })).sqlstate).toBe('23514');
      expect((await reason({ email: 'nobody@aurora.test' })).sqlstate).toBe('23502'); // no name
      expect((await reason({ full_name: 'X', email: 'marco.colombo@aurora.test' })).constraint).toBe('member_identities_email');
      // A site of another company.
      expect((await reason({ full_name: 'X', site_id: sites.firenze })).sqlstate).toBe('23503');
      expect((await reason({ full_name: 'X', site_id: 'not-a-uuid' })).sqlstate).toBe('22P02');
      expect((await reason('just a string')).sqlstate).toBe('23502');
    });
  });

  it('is limited to HR of the target company', async () => {
    await inTx(db, async (s) => {
      const row = [{ full_name: 'Laura Ferri' }];
      await s.as(users.marco);
      expect((await importError(s, row)).message).toContain('forbidden');
      await s.as(users.luca);
      expect((await importError(s, row)).message).toContain('forbidden');
      await s.as(users.francesca); // Bellavista owner
      expect((await importError(s, row)).message).toContain('forbidden');
      await s.anon();
      expect((await importError(s, row)).code).toBe('42501');
      await s.as(users.mario);
      expect(await importRows(s, row)).toBe(1);
    });
  });

  it('rejects empty, oversized and non-array payloads', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      expect((await importError(s, [])).message).toContain('invalid_items');
      expect((await importError(s, { full_name: 'X' })).message).toContain('invalid_items');
      const many = Array.from({ length: 1001 }, (_, i) => ({ full_name: `P ${i}` }));
      expect((await importError(s, many)).message).toContain('invalid_items');
    });
  });
});
