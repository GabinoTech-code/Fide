import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed } from './harness';

let db: PGlite;
beforeAll(async () => { db = await createDb(); }, 60_000);
afterAll(async () => db?.close());

describe('HR balance entry and employee dashboard', () => {
  it('loads fractional hours and carry-over, then reflects pending and approved requests', async () => {
    await inTx(db, async (s) => {
      await s.as(seed.users.giulia);
      const rol = await s.value<string>(`select id from public.leave_types where company_id = $1 and code = 'ROL'`, [seed.aurora]);
      await s.rows(`insert into public.leave_balances (company_id, member_id, leave_type_id, year, entitled, carried_over, note)
        values ($1, $2, $3, 2027, 22.50, 3.25, 'Paghe gennaio')`, [seed.aurora, seed.members.marco, rol]);
      await s.as(seed.users.marco);
      const request = await s.value<string>(`insert into public.leave_requests (company_id, member_id, leave_type_id, start_date, end_date, quantity)
        values ($1, $2, $3, '2027-02-01', '2027-02-01', 1.50) returning id`, [seed.aurora, seed.members.marco, rol]);
      const read = () => s.one(`select unit, entitled, carried_over, used, pending, remaining from public.leave_balance_summary
        where member_id = $1 and year = 2027`, [seed.members.marco]);
      expect(await read()).toEqual({ unit: 'hours', entitled: '22.50', carried_over: '3.25', used: '0', pending: '1.50', remaining: '25.75' });
      await s.as(seed.users.luca);
      await s.rows(`select public.decide_leave_request($1, true)`, [request]);
      await s.as(seed.users.marco);
      expect(await read()).toEqual({ unit: 'hours', entitled: '22.50', carried_over: '3.25', used: '1.50', pending: '0', remaining: '24.25' });
      await s.as(seed.users.giulia);
      await s.rows(`update public.leave_balances set entitled = 24.50 where member_id = $1 and year = 2027`, [seed.members.marco]);
      await s.as(seed.users.marco);
      expect((await read()).remaining).toBe('26.25');
      await s.as(seed.users.giulia);
      await s.rows(`update public.leave_balances set used_external = 5.25 where member_id = $1 and year = 2027`, [seed.members.marco]);
      await s.as(seed.users.marco);
      expect((await read()).remaining).toBe('21.00');
      expect(await s.rows(`update public.leave_balances set used_external = 0 returning id`)).toEqual([]);
    });
  });

  it('keeps an unentered balance distinct from zero and isolates companies and coworkers', async () => {
    await inTx(db, async (s) => {
      await s.as(seed.users.marco);
      expect(await s.rows(`select * from public.leave_balance_summary where year = 2028`)).toEqual([]);
      expect(await s.rows(`select * from public.leave_balance_summary where member_id = $1`, [seed.members.anna])).toEqual([]);
      expect(await s.rows(`update public.leave_balances set entitled = 999 returning id`)).toEqual([]);
      await s.as(seed.users.francesca);
      expect(await s.rows(`select * from public.leave_balance_summary where company_id = $1`, [seed.aurora])).toEqual([]);
      expect(await s.rows(`update public.leave_balances set entitled = 999 where company_id = $1 returning id`, [seed.aurora])).toEqual([]);
      await s.as(seed.users.giulia);
      const ferie = await s.value<string>(`select id from public.leave_types where company_id = $1 and code = 'FERIE'`, [seed.aurora]);
      expect((await s.error(`insert into public.leave_balances (company_id, member_id, leave_type_id, year, entitled)
        values ($1, $2, $3, 2028, 20)`, [seed.aurora, seed.members.sara, ferie])).code).toBe('23503');
      expect((await s.error(`insert into public.leave_balances (company_id, member_id, leave_type_id, year, entitled)
        values ($1, $2, $3, 2028, -1)`, [seed.aurora, seed.members.marco, ferie])).code).toBe('23514');
      await s.rows(`insert into public.leave_balances (company_id, member_id, leave_type_id, year, entitled)
        values ($1, $2, $3, 2028, 0)`, [seed.aurora, seed.members.marco, ferie]);
      await s.as(seed.users.marco);
      expect(await s.value(`select remaining from public.leave_balance_summary where year = 2028`)).toBe('0.00');
    });
  });
});
