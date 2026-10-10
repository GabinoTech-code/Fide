import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed, type Session } from './harness';
let db: PGlite;
beforeAll(async () => { db = await createDb(); }, 60_000);
afterAll(async () => db?.close());
const call = `select public.add_employment_terms($1, $2::date, 'Capo turno', 'Operaio', 'D2', 'Tempo indeterminato', 'Riferimento test', $3, $4)`;
async function add(s: Session, date: string, latest: string | null = null, member: string = seed.members.marco, hours = 40) {
  return s.value<string>(call, [member, date, hours, latest]);
}
describe('employment references and version history', () => {
  it('derives company and author, preserves roles and includes only own data in the export', async () => {
    await inTx(db, async (s) => {
      await s.as(seed.users.giulia);
      const id = await add(s, '2025-01-01');
      const row = await s.one(`select company_id,created_by from public.employment_terms where id = $1`, [id]);
      expect(row).toEqual({ company_id: seed.aurora, created_by: seed.members.giulia });
      await s.as(seed.users.marco);
      expect(await s.value('select role from public.members where id=$1', [seed.members.marco])).toBe('employee');
      const exported = await s.value<{employment_terms: Array<{id: string;created_by?: string}>}>('select public.export_my_data()');
      expect(exported.employment_terms).toHaveLength(1);
      expect(exported.employment_terms[0]).toEqual(expect.objectContaining({ id }));
      expect(exported.employment_terms[0].created_by).toBeUndefined();
      await s.as(seed.users.anna);
      expect(await s.rows('select id from public.employment_terms')).toEqual([]);
      expect(await s.value(`select jsonb_array_length(public.export_my_data()->'employment_terms')`)).toBe(0);
      await s.as(seed.users.luca);
      expect(await s.rows('select id from public.employment_terms')).toEqual([]);
      await s.as(seed.users.francesca);
      expect(await s.rows('select id from public.employment_terms')).toEqual([]);
      expect((await s.error(call, [seed.members.marco,'2027-01-01',40,id])).code).toBe('42501');
    });
  });
  it('checks optimistic concurrency, prevents rewriting the past and retains replaced versions', async () => {
    await inTx(db, async (s) => {
      await s.as(seed.users.giulia);
      const first = await add(s, '2025-01-01');
      expect((await s.error(call,[seed.members.marco,'2090-01-01',40,null])).message).toContain('employment_stale');
      expect((await s.error(call,[seed.members.marco,'2025-02-01',40,first])).message).toContain('employment_date_invalid');
      const future = await add(s,'2090-01-01',first);
      const replacement = await add(s,'2090-01-01',future,seed.members.marco,32);
      expect(await s.value('select count(*)::int from public.employment_terms')).toBe(3);
      expect(await s.value('select voided_at is not null from public.employment_terms where id=$1',[future])).toBe(true);
      await s.rows('select public.void_employment_terms($1)',[replacement]);
      expect((await s.error('select public.void_employment_terms($1)',[first])).message).toContain('employment_not_future');
      expect((await s.error('select public.void_employment_terms($1)',[replacement])).message).toContain('employment_not_future');
    });
  });
  it('refuses direct writes, employee and manager RPC calls, invalid values and terminated targets', async () => {
    await inTx(db, async (s) => {
      for (const user of [seed.users.marco,seed.users.luca]) {
        await s.as(user);
        expect((await s.error(call,[seed.members.marco,'2025-01-01',40,null])).code).toBe('42501');
      }
      await s.as(seed.users.giulia);
      expect((await s.error(`insert into public.employment_terms(company_id,member_id,effective_from,job_title,contract_type,weekly_hours,created_by) values ($1,$2,'2025-01-01','X','Y',40,$3)`,[seed.aurora,seed.members.marco,seed.members.giulia])).code).toBe('42501');
      expect((await s.error(call,[seed.members.mario,'2025-01-01',40,null])).code).toBe('42501');
      expect((await s.error(call,[seed.members.marco,'2025-01-01',0,null])).code).toBe('23514');
      const id = await add(s,'2025-01-01');
      expect((await s.error(`update public.employment_terms set weekly_hours=12 where id=$1`,[id])).code).toBe('42501');
      await s.rows(`select public.set_member_status($1,'terminated',current_date)`,[seed.members.marco]);
      expect((await s.error(call,[seed.members.marco,'2090-01-01',40,id])).message).toContain('member_not_active');
    });
  });
  it('blocks suspended HR and purges expired operational references through the service-only job', async () => {
    await inTx(db, async (s) => {
      await s.as(seed.users.giulia);
      await add(s,'2025-01-01');
      expect((await s.error('select private.purge_employment_terms()')).code).toBe('42501');
      await s.as(seed.users.mario);
      await s.rows(`select public.set_member_status($1,'suspended',null)`,[seed.members.giulia]);
      await s.as(seed.users.giulia);
      expect((await s.error(call,[seed.members.anna,'2025-01-01',40,null])).code).toBe('42501');
      await s.as(seed.users.mario);
      await s.rows(`select public.set_member_status($1,'terminated',current_date)`,[seed.members.marco]);
      await s.superuser();
      await s.rows(`update public.members set terminated_on=current_date - 400 where id=$1`,[seed.members.marco]);
      await s.as(seed.users.marco);
      expect(await s.rows('select id from public.employment_terms')).toEqual([]);
      await s.service();
      await s.rows('select private.purge_employment_terms()');
      await s.superuser();
      expect(await s.value('select count(*)::int from public.employment_terms')).toBe(0);
      expect(await s.value(`select count(*)::int from public.audit_log where table_name='employment_terms'`)).toBeGreaterThan(0);
    });
  });
});
