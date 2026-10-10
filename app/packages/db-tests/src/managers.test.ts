// Team managers ("capo turno"): approving power follows the role, not just the
// manager_member_id link (migration 20261010100000_manager_role.sql).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, members, aurora } = seed;

type Tx = Parameters<Parameters<typeof inTx>[1]>[0];

/** Marco asks for a day of ferie; returns the request id. */
async function marcoAsks(s: Tx): Promise<string> {
  await s.as(users.marco);
  return s.value<string>(
    `insert into public.leave_requests (company_id, member_id, leave_type_id, start_date, end_date, quantity)
     select $1, $2, id, '2026-12-28', '2026-12-28', 1 from public.leave_types where company_id = $1 and code = 'FERIE'
     returning id`,
    [aurora, members.marco],
  );
}
const decide = (id: string) => `select public.decide_leave_request('${id}', true, null)`;
/** update_member keeping the member's e-mail and CF (they are locked once active). */
async function updateMember(s: Tx, member: string, name: string, manager: string | null): Promise<string> {
  await s.superuser();
  const id = await s.one<{ email: string; codice_fiscale: string }>(
    `select email, codice_fiscale from public.member_identities where member_id = $1`,
    [member],
  );
  await s.as(users.giulia);
  return `select public.update_member('${member}', '${name}', '${id.email}', '${id.codice_fiscale}', null, null, ${manager ? `'${manager}'` : 'null'}, 'it')`;
}
const setManager = (member: string, manager: string | null) =>
  `update public.members set manager_member_id = ${manager ? `'${manager}'` : 'null'} where id = '${member}'`;

describe('team managers', () => {
  it('the seed manager approves his team, not others, not himself', async () => {
    await inTx(db, async (s) => {
      expect(await s.value(`select role from public.members where id = $1`, [members.luca])).toBe('manager');
      const id = await marcoAsks(s);
      await s.as(users.luca);
      await s.rows(decide(id));
      expect(await s.value(`select status from public.leave_requests where id = $1`, [id])).toBe('approved');
    });
  });

  it('an employee cannot be picked as manager, by any path', async () => {
    await inTx(db, async (s) => {
      const update = await updateMember(s, members.anna, 'Anna', members.marco);
      expect((await s.error(update)).message).toContain('manager_invalid');
      const add = `select public.add_member('${aurora}', 'Nuovo', 'n@aurora.test', 'SPSLNE83R59C351O', null, '${members.marco}')`;
      expect((await s.error(add)).message).toContain('manager_invalid');
      await s.superuser();
      expect((await s.error(setManager(members.anna, members.marco))).message).toContain('manager_invalid');
      expect((await s.error(setManager(members.anna, members.anna))).message).toContain('manager_invalid');
      // Another company's manager is not valid either.
      expect((await s.error(setManager(members.anna, members.francesca))).message).toContain('manager_invalid');
    });
  });

  it('a stale link to an employee grants nothing (rows written before the trigger)', async () => {
    await inTx(db, async (s) => {
      await s.superuser();
      await s.rows(`alter table public.members disable trigger members_manager_role`);
      await s.rows(setManager(members.anna, members.marco));
      await s.rows(`alter table public.members enable trigger members_manager_role`);
      await s.as(users.anna);
      const id = await s.value<string>(
        `insert into public.leave_requests (company_id, member_id, leave_type_id, start_date, end_date, quantity)
         select $1, $2, id, '2026-12-28', '2026-12-28', 1 from public.leave_types where company_id = $1 and code = 'FERIE'
         returning id`,
        [aurora, members.anna],
      );
      await s.as(users.marco);
      expect((await s.error(decide(id))).message).toContain('forbidden');
      expect(await s.rows(`select id from public.leave_requests where id = $1`, [id])).toEqual([]);
    });
  });

  it('taking the role away releases the team; suspension keeps it but approves nothing', async () => {
    await inTx(db, async (s) => {
      const id = await marcoAsks(s);
      await s.superuser();
      await s.rows(`update public.members set status = 'suspended' where id = $1`, [members.luca]);
      await s.as(users.luca);
      expect((await s.error(decide(id))).code).not.toBeUndefined();
      await s.superuser();
      expect(await s.value(`select manager_member_id from public.members where id = $1`, [members.marco])).toBe(members.luca);
      await s.rows(`update public.members set status = 'active' where id = $1`, [members.luca]);

      await s.as(users.giulia);
      await s.rows(`select public.set_member_role($1, 'employee')`, [members.luca]);
      await s.superuser();
      expect(await s.rows(`select id from public.members where manager_member_id = $1`, [members.luca])).toEqual([]);
      await s.as(users.luca);
      expect((await s.error(decide(id))).message).toContain('forbidden');
    });
  });

  it('editing other fields does not re-check an existing manager', async () => {
    await inTx(db, async (s) => {
      await s.superuser();
      await s.rows(`update public.members set status = 'suspended' where id = $1`, [members.luca]);
      await s.rows(await updateMember(s, members.marco, 'Marco Rossi', members.luca));
      expect(await s.value(`select full_name from public.members where id = $1`, [members.marco])).toBe('Marco Rossi');
    });
  });
});
