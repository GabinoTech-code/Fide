import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed, type Session } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, members } = seed;

async function leaveType(s: Session, code: string) {
  await s.superuser();
  return s.value<string>(`select id from public.leave_types where company_id = $1 and code = $2`, [seed.aurora, code]);
}

const askLeave = `insert into public.leave_requests (company_id, member_id, leave_type_id, start_date, end_date, quantity, protocol_number)
                  values ($1, $2, $3, $4, $5, $6, $7) returning id, status`;

describe('leave requests', () => {
  it('ferie: requested by the employee, approved by the manager, subtracted from the balance', async () => {
    await inTx(db, async (s) => {
      const ferie = await leaveType(s, 'FERIE');
      await s.as(users.marco);
      const req = await s.one<{ id: string; status: string }>(askLeave, [
        seed.aurora, members.marco, ferie, '2026-12-28', '2026-12-29', 2, null,
      ]);
      expect(req.status).toBe('pending');
      expect(await s.one(`select used, pending, remaining from public.leave_balance_summary where code = 'FERIE'`)).toEqual({
        used: '0',
        pending: '2.00',
        remaining: '30.00',
      });

      expect((await s.error(`select public.decide_leave_request($1, true)`, [req.id])).message).toContain('forbidden');
      await s.as(users.anna);
      expect((await s.error(`select public.decide_leave_request($1, true)`, [req.id])).message).toContain('forbidden');
      await s.as(users.luca);
      await s.rows(`select public.decide_leave_request($1, true, 'Buone feste')`, [req.id]);

      await s.as(users.marco);
      expect(await s.one(`select used, remaining from public.leave_balance_summary where code = 'FERIE'`)).toEqual({
        used: '2.00',
        remaining: '28.00',
      });
    });
  });

  it('malattia needs the INPS protocol and is approved on arrival', async () => {
    await inTx(db, async (s) => {
      const malattia = await leaveType(s, 'MALATTIA');
      await s.as(users.marco);
      const params = [seed.aurora, members.marco, malattia, '2026-10-07', '2026-10-09', 3];
      expect((await s.error(askLeave, [...params, null])).message).toContain('protocol_required');
      const req = await s.one<{ status: string }>(askLeave, [...params, '1234567890']);
      expect(req.status).toBe('approved');
    });
  });

  it('employees cannot approve through the table, ask for colleagues or edit balances', async () => {
    await inTx(db, async (s) => {
      const ferie = await leaveType(s, 'FERIE');
      await s.as(users.marco);
      expect(
        (await s.error(
          `insert into public.leave_requests (company_id, member_id, leave_type_id, start_date, end_date, quantity, status)
           values ($1, $2, $3, '2026-11-02', '2026-11-02', 1, 'approved')`,
          [seed.aurora, members.marco, ferie],
        )).code,
      ).toBe('42501');
      expect((await s.error(askLeave, [seed.aurora, members.anna, ferie, '2026-11-02', '2026-11-02', 1, null])).code).toBe(
        '42501',
      );
      expect(
        await s.rows(`update public.leave_balances set entitled = 365 returning id`),
      ).toEqual([]);
      expect(
        (await s.error(
          `insert into public.leave_balances (company_id, member_id, leave_type_id, year, entitled) values ($1, $2, $3, 2027, 99)`,
          [seed.aurora, members.marco, ferie],
        )).code,
      ).toBe('42501');

      await s.as(users.giulia);
      expect(
        await s.rows(
          `insert into public.leave_balances (company_id, member_id, leave_type_id, year, entitled) values ($1, $2, $3, 2027, 26) returning year`,
          [seed.aurora, members.marco, ferie],
        ),
      ).toEqual([{ year: 2027 }]);
    });
  });

  it('managers do not decide their own requests; HR does', async () => {
    await inTx(db, async (s) => {
      const rol = await leaveType(s, 'ROL');
      await s.as(users.luca);
      const { id } = await s.one<{ id: string }>(askLeave, [seed.aurora, members.luca, rol, '2026-11-03', '2026-11-03', 4, null]);
      expect((await s.error(`select public.decide_leave_request($1, true)`, [id])).message).toContain('forbidden');
      await s.as(users.giulia);
      await s.rows(`select public.decide_leave_request($1, false, 'Picco di lavoro')`, [id]);
      await s.as(users.luca);
      expect(await s.one(`select status, decision_note from public.leave_requests where id = $1`, [id])).toEqual({
        status: 'rejected',
        decision_note: 'Picco di lavoro',
      });
    });
  });
});

describe('audit log', () => {
  it('records column names (not values) and is visible to HR of the company only', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      // A no-op update leaves no trace; a real change records the column name.
      await s.rows(`update public.members set full_name = 'Marco Colombo' where id = $1`, [members.marco]);
      await s.rows(`update public.members set full_name = 'Marco Colombo Jr.' where id = $1`, [members.marco]);
      const entry = await s.one(
        `select table_name, operation, changed_columns, actor_auth_user_id, actor_db_role
         from public.audit_log where row_id = $1 and actor_auth_user_id = $2`,
        [members.marco, users.giulia],
      );
      expect(entry).toEqual({
        table_name: 'members',
        operation: 'UPDATE',
        changed_columns: ['full_name'],
        actor_auth_user_id: users.giulia,
        actor_db_role: 'authenticated',
      });

      await s.as(users.marco);
      expect(await s.rows(`select id from public.audit_log`)).toEqual([]);
      await s.as(users.francesca);
      const companies = await s.rows(`select distinct company_id from public.audit_log`);
      expect(companies).toEqual([{ company_id: seed.bellavista }]);

      await s.service();
      expect((await s.error(`delete from public.audit_log`)).message).toContain('append-only');
    });
  });
});

describe('GDPR self-service', () => {
  it('export_my_data contains only the caller, even for managers and HR', async () => {
    await inTx(db, async (s) => {
      await s.as(users.luca);
      const data = await s.value<{ memberships: Array<{ id: string }>; identities: unknown[]; format: string }>(
        `select public.export_my_data()`,
      );
      expect(data.format).toBe('fide-export-v1');
      expect(data.memberships.map((m) => m.id)).toEqual([members.luca]);
      expect(data.identities).toHaveLength(1);
    });
  });

  it('employees file requests; HR resolves them', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      const { id } = await s.one<{ id: string }>(
        `insert into public.gdpr_requests (company_id, member_id, kind, details) values ($1, $2, 'erasure', 'Lascio l''azienda') returning id`,
        [seed.aurora, members.marco],
      );
      expect((await s.error(`select public.resolve_gdpr_request($1, 'completed')`, [id])).message).toContain('forbidden');
      await s.as(users.giulia);
      await s.rows(`select public.resolve_gdpr_request($1, 'in_progress', 'Presa in carico')`, [id]);
      expect(await s.value(`select status from public.gdpr_requests where id = $1`, [id])).toBe('in_progress');
    });
  });
});

describe('push tokens and preferences', () => {
  it('a token belongs to its user only', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      await s.rows(`insert into public.push_tokens (expo_push_token, platform) values ('ExponentPushToken[abc123]', 'ios')`);
      expect((await s.error(`insert into public.push_tokens (expo_push_token, platform) values ('not-a-token', 'ios')`)).code).toBe(
        '23514',
      );
      await s.as(users.anna);
      expect(await s.rows(`select id from public.push_tokens`)).toEqual([]);
      expect(await s.rows(`delete from public.push_tokens returning id`)).toEqual([]);
      await s.as(users.marco);
      expect(await s.value(`select count(*)::int from public.push_tokens`)).toBe(1);
    });
  });

  it('set_my_language only touches the caller', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      await s.rows(`select public.set_my_language('ro')`);
      await s.superuser();
      expect(
        await s.rows(`select id from public.members where preferred_language = 'ro'`),
      ).toEqual([{ id: members.marco }]);
    });
  });
});
