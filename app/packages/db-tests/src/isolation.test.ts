import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed, type Session } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, members } = seed;

async function tablesWithCompanyId(s: Session) {
  return (
    await s.rows<{ name: string }>(
      `select c.table_name as name from information_schema.columns c
       join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'company_id' and t.table_type = 'BASE TABLE'
       order by 1`,
    )
  ).map((r) => r.name);
}

describe('tenant isolation', () => {
  const cases: Array<[string, string, string | null]> = [
    ['Aurora owner', users.mario, seed.aurora],
    ['Aurora HR', users.giulia, seed.aurora],
    ['Aurora manager', users.luca, seed.aurora],
    ['Aurora employee', users.marco, seed.aurora],
    ['Bellavista owner', users.francesca, seed.bellavista],
    ['Bellavista employee', users.sara, seed.bellavista],
    ['invited, not linked', users.paolo, null],
    ['no membership', users.stranger, null],
  ];

  it.each(cases)('%s only sees rows of their own company', async (_label, user, company) => {
    await inTx(db, async (s) => {
      const tables = await tablesWithCompanyId(s);
      expect(tables).toContain('punches');
      await s.as(user);
      for (const table of tables) {
        const seen = await s.rows<{ company_id: string }>(`select distinct company_id from public.${table}`);
        expect(seen.map((r) => r.company_id), table).toEqual(
          company && seen.length ? [company] : [],
        );
      }
      const companies = await s.rows<{ id: string }>(`select id from public.companies`);
      expect(companies.map((c) => c.id)).toEqual(company ? [company] : []);
    });
  });

  it('a suspended member loses access', async () => {
    await inTx(db, async (s) => {
      await s.superuser();
      await s.rows(`update public.members set status = 'suspended' where id = $1`, [members.marco]);
      await s.as(users.marco);
      expect(await s.rows(`select id from public.companies`)).toEqual([]);
      expect(await s.rows(`select id from public.members`)).toEqual([]);
    });
  });
});

describe('who sees whom inside a company', () => {
  it('an employee sees only themself, their identity and their key', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      expect(await s.rows(`select id from public.members`)).toEqual([{ id: members.marco }]);
      expect(await s.rows(`select member_id from public.member_identities`)).toEqual([{ member_id: members.marco }]);
      expect(await s.rows(`select id from public.device_keys`)).toEqual([{ id: seed.keys.marco }]);
      expect(await s.rows(`select id from public.kiosk_devices`)).toEqual([]);
      expect(await s.rows(`select id from public.invitations`)).toEqual([]);
      expect((await s.rows(`select id from public.sites`)).length).toBe(2);
    });
  });

  it('a manager sees their reports but not their tax codes or e-mails', async () => {
    await inTx(db, async (s) => {
      await s.as(users.luca);
      const visible = (await s.rows<{ id: string }>(`select id from public.members order by id`)).map((r) => r.id);
      expect(visible).toEqual([members.luca, members.marco, members.anna].sort());
      expect(await s.rows(`select member_id from public.member_identities`)).toEqual([{ member_id: members.luca }]);
      expect(await s.rows(`select id from public.device_keys`)).toEqual([]);
    });
  });

  it('HR sees every member, identity and kiosk of the company', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      expect(await s.value(`select count(*)::int from public.members`)).toBe(6);
      expect(await s.value(`select count(*)::int from public.member_identities`)).toBe(6);
      expect(await s.value(`select count(*)::int from public.kiosk_devices`)).toBe(1);
      expect(await s.value(`select count(*)::int from public.device_keys`)).toBe(2);
    });
  });
});

describe('writes are limited to the right role and columns', () => {
  it('only HR creates sites, and only in their company', async () => {
    await inTx(db, async (s) => {
      const insert = `insert into public.sites (company_id, name) values ($1, 'Nuova sede') returning id`;
      await s.as(users.marco);
      expect((await s.error(insert, [seed.aurora])).code).toBe('42501');
      await s.as(users.giulia);
      expect((await s.error(insert, [seed.bellavista])).code).toBe('42501');
      expect(await s.rows(insert, [seed.aurora])).toHaveLength(1);
    });
  });

  it('enables geolocation only with coordinates', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const err = await s.error(
        `insert into public.sites (company_id, name, geo_enabled) values ($1, 'Senza coordinate', true)`,
        [seed.aurora],
      );
      expect(err.code).toBe('23514');
    });
  });

  it('employees cannot change companies; HR cannot change the VAT number', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      expect(await s.rows(`update public.companies set legal_name = 'Hacked' returning id`)).toEqual([]);
      await s.as(users.francesca);
      expect(
        await s.rows(`update public.companies set legal_name = 'Hacked' where id = $1 returning id`, [seed.aurora]),
      ).toEqual([]);
      await s.as(users.giulia);
      expect(await s.rows(`update public.companies set legal_name = 'Officine Aurora SpA' returning id`)).toEqual([
        { id: seed.aurora },
      ]);
      expect((await s.error(`update public.companies set vat_number = '12345678903'`)).code).toBe('42501');
    });
  });

  it('nobody escalates their role or moves members by updating the table', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      expect((await s.error(`update public.members set role = 'hr_admin' where id = $1`, [members.marco])).code).toBe(
        '42501',
      );
      expect(
        await s.rows(`update public.members set full_name = 'X' where id = $1 returning id`, [members.marco]),
      ).toEqual([]);
      await s.as(users.giulia);
      expect((await s.error(`update public.members set role = 'company_owner' where id = $1`, [members.giulia])).code).toBe(
        '42501',
      );
      expect(
        (await s.error(`update public.members set company_id = $1 where id = $2`, [seed.bellavista, members.marco])).code,
      ).toBe('42501');
      expect(
        (await s.error(`update public.members set auth_user_id = $1 where id = $2`, [users.stranger, members.paolo])).code,
      ).toBe('42501');
      expect(
        await s.rows(`update public.members set full_name = 'Marco Colombo Jr.' where id = $1 returning id`, [members.marco]),
      ).toEqual([{ id: members.marco }]);
    });
  });

  it('HR edits identities with a valid codice fiscale only', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      expect(
        (await s.error(`update public.member_identities set codice_fiscale = 'RSSMRA85T10A562T' where member_id = $1`, [
          members.marco,
        ])).code,
      ).toBe('23514');
      await s.as(users.marco);
      expect(
        await s.rows(`update public.member_identities set email = 'x@y.test' where member_id = $1 returning member_id`, [
          members.marco,
        ]),
      ).toEqual([]);
    });
  });
});
