import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, members } = seed;
const registerNewco = `select public.register_company('Newco S.r.l.', '09876543217', 'Nadia Fondatrice') as id`;

describe('register_company', () => {
  it('creates the company, the owner membership and the Italian leave types', async () => {
    await inTx(db, async (s) => {
      await s.as(users.founder);
      const id = await s.value<string>(registerNewco);
      expect(await s.rows(`select id from public.companies`)).toEqual([{ id }]);
      expect(await s.one(`select role, status, full_name from public.members`)).toEqual({
        role: 'company_owner',
        status: 'active',
        full_name: 'Nadia Fondatrice',
      });
      expect(await s.value(`select email from public.member_identities`)).toBe('founder@newco.test');
      const codes = await s.rows<{ code: string }>(`select code from public.leave_types order by code`);
      expect(codes.map((c) => c.code)).toEqual(['EXFEST', 'FERIE', 'L104', 'MALATTIA', 'ROL', 'STRAORD']);
    });
  });

  it('is limited to the pilot allowlist unless signup_mode is open', async () => {
    await inTx(db, async (s) => {
      await s.as(users.stranger);
      expect((await s.error(registerNewco)).message).toContain('signup_not_allowed');
      await s.superuser();
      await s.rows(`update private.app_settings set value = 'open' where key = 'signup_mode'`);
      await s.as(users.stranger);
      expect(await s.value(registerNewco)).toBeTruthy();
    });
  });

  it('requires a confirmed e-mail', async () => {
    await inTx(db, async (s) => {
      await s.superuser();
      await s.rows(`update auth.users set email_confirmed_at = null where id = $1`, [users.founder]);
      await s.as(users.founder);
      expect((await s.error(registerNewco)).message).toContain('email_not_confirmed');
    });
  });

  it('rejects invalid and already registered VAT numbers', async () => {
    await inTx(db, async (s) => {
      await s.as(users.founder);
      expect((await s.error(`select public.register_company('Newco', '09876543210', 'N')`)).code).toBe('23514');
      expect((await s.error(`select public.register_company('Clone', '01234567897', 'N')`)).code).toBe('23505');
    });
  });
});

describe('add_member and roles', () => {
  const add = (role = 'employee', cf = 'MRNPLA80P10A794D') =>
    `select public.add_member('${seed.aurora}', 'Nuovo Assunto', 'nuovo@aurora.test', '${cf}', null, null, null, '${role}')`;

  it('HR adds employees with a valid codice fiscale', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      // Paolo already uses this CF in Aurora: unique per company.
      expect((await s.error(add())).code).toBe('23505');
      const id = await s.value<string>(add('employee', 'SPSLNE83R59C351O'));
      expect(await s.one(`select status, role from public.members where id = $1`, [id])).toEqual({
        status: 'invited',
        role: 'employee',
      });
      expect((await s.error(add('employee', 'SPSLNE83R59C351X'))).code).toBe('23514');
    });
  });

  it('only owners create HR admins; employees and other companies cannot add members', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      expect((await s.error(add('hr_admin', 'SPSLNE83R59C351O'))).message).toContain('forbidden');
      await s.as(users.marco);
      expect((await s.error(add('employee', 'SPSLNE83R59C351O'))).message).toContain('forbidden');
      await s.as(users.francesca);
      expect((await s.error(add('employee', 'SPSLNE83R59C351O'))).message).toContain('forbidden');
      await s.as(users.mario);
      expect(await s.value(add('hr_admin', 'SPSLNE83R59C351O'))).toBeTruthy();
    });
  });

  it('set_member_role: HR promotes to manager, only owners touch HR/owner, the last owner stays', async () => {
    await inTx(db, async (s) => {
      const setRole = (member: string, role: string) => `select public.set_member_role('${member}', '${role}')`;
      await s.as(users.giulia);
      await s.rows(setRole(members.marco, 'manager'));
      expect((await s.error(setRole(members.marco, 'hr_admin'))).message).toContain('forbidden');
      expect((await s.error(setRole(members.giulia, 'employee'))).message).toContain('forbidden');
      await s.as(users.marco);
      expect((await s.error(setRole(members.anna, 'manager'))).message).toContain('forbidden');
      await s.as(users.mario);
      expect((await s.error(setRole(members.mario, 'hr_admin'))).message).toContain('last_owner');
      await s.rows(setRole(members.giulia, 'company_owner'));
      await s.rows(setRole(members.mario, 'hr_admin'));
      expect(await s.value(`select role from public.members where id = $1`, [members.mario])).toBe('hr_admin');
    });
  });

  it('set_member_status: HR suspends employees but not owners or themself', async () => {
    await inTx(db, async (s) => {
      const setStatus = (member: string, status: string) => `select public.set_member_status('${member}', '${status}')`;
      await s.as(users.giulia);
      await s.rows(setStatus(members.marco, 'suspended'));
      expect((await s.error(setStatus(members.mario, 'suspended'))).message).toContain('forbidden');
      expect((await s.error(setStatus(members.giulia, 'suspended'))).message).toContain('forbidden');
      expect((await s.error(setStatus(members.marco, 'erased'))).message).toContain('invalid_status');
      await s.rows(setStatus(members.marco, 'active'));
    });
  });
});

describe('invitations', () => {
  const invitePaolo = `select public.create_invitation('${members.paolo}') as token`;
  const redeem = (token: string) => `select public.redeem_invitation('${token}') as member_id`;

  it('HR invites, the invited e-mail redeems once', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const token = await s.value<string>(invitePaolo);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await s.one(`select status, email from public.invitations`)).toEqual({
        status: 'pending',
        email: 'paolo.marino@aurora.test',
      });

      await s.as(users.paolo);
      expect(await s.rows(`select id from public.companies`)).toEqual([]);
      expect(await s.value(redeem(token))).toBe(members.paolo);
      expect(await s.rows(`select id from public.companies`)).toEqual([{ id: seed.aurora }]);
      expect(await s.value(`select status from public.members where id = $1`, [members.paolo])).toBe('active');
      expect((await s.error(redeem(token))).message).toContain('invitation_invalid');
    });
  });

  it('a forwarded link is useless for another e-mail', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const token = await s.value<string>(invitePaolo);
      await s.as(users.stranger);
      expect((await s.error(redeem(token))).message).toContain('invitation_email_mismatch');
      await s.as(users.sara);
      expect((await s.error(redeem(token))).message).toContain('invitation_email_mismatch');
    });
  });

  it('expired, revoked, replaced and unknown tokens are rejected', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const first = await s.value<string>(invitePaolo);
      const second = await s.value<string>(invitePaolo);
      await s.as(users.paolo);
      expect((await s.error(redeem(first))).message).toContain('invitation_invalid');
      expect((await s.error(redeem('x'.repeat(43)))).message).toContain('invitation_invalid');

      await s.superuser();
      await s.rows(`update public.invitations set expires_at = now() - interval '1 minute' where status = 'pending'`);
      await s.as(users.paolo);
      expect((await s.error(redeem(second))).message).toContain('invitation_invalid');

      await s.as(users.giulia);
      const third = await s.value<string>(invitePaolo);
      const invitation = await s.value<string>(`select id from public.invitations where status = 'pending'`);
      await s.rows(`select public.revoke_invitation($1)`, [invitation]);
      await s.as(users.paolo);
      expect((await s.error(redeem(third))).message).toContain('invitation_invalid');
    });
  });

  it('only HR of the company invites, and only members still invited', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      expect((await s.error(invitePaolo)).message).toContain('forbidden');
      await s.as(users.francesca);
      expect((await s.error(invitePaolo)).message).toContain('forbidden');
      await s.as(users.giulia);
      expect((await s.error(`select public.create_invitation('${members.marco}')`)).message).toContain(
        'member_not_invitable',
      );
    });
  });
});

describe('device keys', () => {
  const pk = (seedText: string) => Buffer.alloc(32, seedText).toString('base64');

  it('registering a new phone revokes the old key and leaves a trail for HR', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      const id = await s.value<string>(`select public.register_device_key($1, $2, $3, 'iPhone 17')`, [
        seed.aurora,
        pk('x'),
        pk('e'),
      ]);
      const keys = await s.rows<{ id: string; status: string }>(
        `select id, status from public.device_keys order by created_at`,
      );
      expect(keys).toEqual([
        { id: seed.keys.marco, status: 'revoked' },
        { id, status: 'active' },
      ]);
      const fingerprint = await s.value<string>(`select fingerprint from public.device_keys where id = $1`, [id]);
      expect(fingerprint).toMatch(/^([0-9A-F]{4} ){5}[0-9A-F]{4}$/);

      await s.as(users.giulia);
      const events = await s.rows(
        `select kind, reason from public.key_events where member_id = $1 order by id`,
        [members.marco],
      );
      expect(events).toEqual([
        { kind: 'registered', reason: 'seed' },
        { kind: 'revoked', reason: 'replaced' },
        { kind: 'registered', reason: null },
      ]);
    });
  });

  it('rejects malformed keys and non-members', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      expect(
        (await s.error(`select public.register_device_key($1, 'bm90IGEga2V5', $2)`, [seed.aurora, pk('e')])).code,
      ).toBe('23514');
      await s.as(users.stranger);
      expect(
        (await s.error(`select public.register_device_key($1, $2, $3)`, [seed.aurora, pk('x'), pk('e')])).message,
      ).toContain('forbidden');
    });
  });

  it('keys can be revoked by their owner or HR, not by colleagues', async () => {
    await inTx(db, async (s) => {
      await s.as(users.anna);
      expect((await s.error(`select public.revoke_device_key($1)`, [seed.keys.marco])).message).toContain('forbidden');
      await s.as(users.giulia);
      await s.rows(`select public.revoke_device_key($1, 'telefono smarrito')`, [seed.keys.marco]);
      expect(await s.value(`select status from public.device_keys where id = $1`, [seed.keys.marco])).toBe('revoked');
    });
  });
});
