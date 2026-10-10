// invitation_preview: the one function anon may execute. It answers only to the
// e-mailed token, with what the e-mail already says, and with nothing otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, members } = seed;
const invitePaolo = `select public.create_invitation('${members.paolo}') as token`;
const preview = (token: string) => `select * from public.invitation_preview('${token}')`;

describe('invitation_preview', () => {
  it('shows company, role and site to the token holder, signed in or not', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const token = await s.value<string>(invitePaolo);
      const expected = await s.one<{ legal_name: string; site: string | null }>(
        `select c.legal_name, st.name as site from public.members m
         join public.companies c on c.id = m.company_id left join public.sites st on st.id = m.site_id
         where m.id = $1`,
        [members.paolo],
      );
      await s.anon();
      const row = await s.one<Record<string, unknown>>(preview(token));
      expect(Object.keys(row).sort()).toEqual(['company_name', 'expires_at', 'role', 'site_name']);
      expect(row).toMatchObject({ company_name: expected.legal_name, role: 'employee', site_name: expected.site });
      await s.as(users.stranger);
      expect(await s.rows(preview(token))).toHaveLength(1);
    });
  });

  it('answers nothing for malformed, unknown, expired, revoked or used tokens', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const token = await s.value<string>(invitePaolo);
      await s.anon();
      for (const bad of ['x', 'x'.repeat(43), `${token}x`, "' or 1=1 --"]) {
        expect(await s.rows(`select * from public.invitation_preview($1)`, [bad]), bad).toEqual([]);
      }
      await s.superuser();
      await s.rows(`update public.invitations set expires_at = now() - interval '1 minute'`);
      await s.anon();
      expect(await s.rows(preview(token))).toEqual([]);

      await s.as(users.giulia);
      const revoked = await s.value<string>(invitePaolo);
      await s.rows(`select public.revoke_invitation(id) from public.invitations where status = 'pending'`);
      await s.anon();
      expect(await s.rows(preview(revoked))).toEqual([]);

      await s.as(users.giulia);
      const used = await s.value<string>(invitePaolo);
      await s.as(users.paolo);
      await s.rows(`select public.redeem_invitation($1)`, [used]);
      await s.anon();
      expect(await s.rows(preview(used))).toEqual([]);
    });
  });

  it('does not open anything else to anon', async () => {
    await inTx(db, async (s) => {
      await s.anon();
      expect((await s.error(`select * from public.invitations`)).code).toBe('42501');
      expect((await s.error(`select public.redeem_invitation('${'x'.repeat(43)}')`)).code).toBe('42501');
    });
  });
});
