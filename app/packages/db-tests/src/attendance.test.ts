import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed, type Session } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, members } = seed;
const sig = Buffer.alloc(64, 7).toString('base64'); // shape only; punch-sync verifies real signatures

function punch(overrides: Record<string, unknown> = {}) {
  return {
    company_id: seed.aurora,
    member_id: members.marco,
    device_key_id: seed.keys.marco,
    client_punch_id: randomUUID(),
    punch_type: 'in',
    method: 'geo',
    site_id: seed.sites.milano,
    in_geofence: true,
    device_ts: '2026-10-07T07:58:00Z',
    signed_payload: 'FIDE-PUNCH-v1\n{}',
    signature: sig,
    receipt_signature: sig,
    flags: [],
    ...overrides,
  };
}

async function record(s: Session, p: Record<string, unknown>) {
  return s.value<{ id: string; receipt_code: string; flags: string[]; duplicate: boolean }>(
    `select public.svc_record_punch($1::jsonb)`,
    [JSON.stringify(p)],
  );
}

describe('punches are append-only and server-written', () => {
  it('clients cannot insert, update or delete punches', async () => {
    await inTx(db, async (s) => {
      await s.service();
      const { id } = await record(s, punch());
      await s.as(users.marco);
      expect((await s.error(`insert into public.punches (company_id) values ($1)`, [seed.aurora])).code).toBe('42501');
      expect((await s.error(`update public.punches set punch_type = 'out' where id = $1`, [id])).code).toBe('42501');
      expect((await s.error(`delete from public.punches where id = $1`, [id])).code).toBe('42501');
      await s.as(users.giulia);
      expect((await s.error(`delete from public.punches where id = $1`, [id])).code).toBe('42501');
    });
  });

  it('even service_role cannot rewrite history', async () => {
    await inTx(db, async (s) => {
      await s.service();
      const { id } = await record(s, punch());
      const upd = await s.error(`update public.punches set device_ts = now() where id = $1`, [id]);
      expect(upd.message).toContain('append-only');
      const del = await s.error(`delete from public.punches where id = $1`, [id]);
      expect(del.message).toContain('append-only');
    });
  });
});

describe('svc_record_punch', () => {
  it('records a punch and is idempotent per device and client id', async () => {
    await inTx(db, async (s) => {
      await s.service();
      const p = punch();
      const first = await record(s, p);
      expect(first.duplicate).toBe(false);
      expect(first.receipt_code).toMatch(/^REC-[0-9A-F]{12}$/);
      const again = await record(s, p);
      expect(again).toMatchObject({ id: first.id, receipt_code: first.receipt_code, duplicate: true });
    });
  });

  it('accepts a kiosk QR window once per member', async () => {
    await inTx(db, async (s) => {
      await s.service();
      const qr = { method: 'qr', in_geofence: null, site_id: seed.sites.magazzino, kiosk_id: seed.kiosk, qr_window: 59_000_000 };
      await record(s, punch(qr));
      expect((await s.error(`select public.svc_record_punch($1::jsonb)`, [JSON.stringify(punch(qr))])).message).toContain(
        'qr_token_reused',
      );
      // Another member may use the same window.
      await record(s, punch({ ...qr, member_id: members.anna, device_key_id: seed.keys.anna }));
      // The kiosk must stand at the site the punch claims.
      expect(
        (await s.error(`select public.svc_record_punch($1::jsonb)`, [
          JSON.stringify(punch({ ...qr, qr_window: 59_000_001, site_id: seed.sites.milano })),
        ])).message,
      ).toContain('kiosk_invalid');
    });
  });

  it('rejects keys of other members, revoked keys and inactive members', async () => {
    await inTx(db, async (s) => {
      await s.service();
      const call = (p: Record<string, unknown>) =>
        s.error(`select public.svc_record_punch($1::jsonb)`, [JSON.stringify(p)]);
      expect((await call(punch({ device_key_id: seed.keys.anna }))).message).toContain('device_key_invalid');
      expect((await call(punch({ device_key_id: seed.keys.sara }))).message).toContain('device_key_invalid');
      expect((await call(punch({ company_id: seed.bellavista }))).message).toContain('member_not_active');

      await s.superuser();
      await s.rows(
        `update public.device_keys set status = 'revoked', revoked_at = '2026-10-07T12:00:00Z' where id = $1`,
        [seed.keys.marco],
      );
      await s.service();
      // Signed offline before the revocation: still valid.
      await record(s, punch({ device_ts: '2026-10-07T11:59:00Z' }));
      expect((await call(punch({ device_ts: '2026-10-07T12:01:00Z' }))).message).toContain('device_key_invalid');

      await s.superuser();
      await s.rows(`update public.members set status = 'suspended' where id = $1`, [members.anna]);
      await s.service();
      expect(
        (await call(punch({ member_id: members.anna, device_key_id: seed.keys.anna }))).message,
      ).toContain('member_not_active');
    });
  });

  it('flags two punches of the same type in a row', async () => {
    await inTx(db, async (s) => {
      await s.service();
      await record(s, punch({ device_ts: '2026-10-07T08:00:00Z' }));
      const second = await record(s, punch({ device_ts: '2026-10-07T08:05:00Z', flags: ['late_sync'] }));
      expect(second.flags).toEqual(['late_sync', 'sequence']);
      const out = await record(s, punch({ device_ts: '2026-10-07T17:00:00Z', punch_type: 'out' }));
      expect(out.flags).toEqual([]);
    });
  });

  it('refuses manual punches and geo punches without a geofence result', async () => {
    await inTx(db, async (s) => {
      await s.service();
      const call = (p: Record<string, unknown>) =>
        s.error(`select public.svc_record_punch($1::jsonb)`, [JSON.stringify(p)]);
      expect((await call(punch({ method: 'manual' }))).code).toBe('22023');
      expect((await call(punch({ in_geofence: null }))).code).toBe('23514');
    });
  });

  it('employee, their manager and HR see the punch; colleagues and other companies do not', async () => {
    await inTx(db, async (s) => {
      await s.service();
      const { id } = await record(s, punch());
      for (const [user, visible] of [
        [users.marco, true],
        [users.luca, true],
        [users.giulia, true],
        [users.mario, true],
        [users.anna, false],
        [users.francesca, false],
        [users.sara, false],
      ] as const) {
        await s.as(user);
        expect((await s.rows(`select id from public.punches where id = $1`, [id])).length, user).toBe(visible ? 1 : 0);
      }
    });
  });
});

describe('kiosks', () => {
  it('HR creates a kiosk and the tablet pairs once with the code', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const created = await s.value<{ kiosk_id: string; pairing_code: string }>(
        `select public.create_kiosk($1, 'Ingresso uffici')`,
        [seed.sites.milano],
      );
      expect(created.pairing_code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
      expect(await s.value(`select status from public.kiosk_devices where id = $1`, [created.kiosk_id])).toBe('pairing');

      await s.service();
      const paired = await s.value<{ kiosk_id: string; secret: string; site_id: string }>(
        `select public.svc_pair_kiosk($1)`,
        [created.pairing_code.toLowerCase()],
      );
      expect(paired.kiosk_id).toBe(created.kiosk_id);
      expect(paired.site_id).toBe(seed.sites.milano);
      expect(Buffer.from(paired.secret, 'base64')).toHaveLength(32);
      expect((await s.error(`select public.svc_pair_kiosk($1)`, [created.pairing_code])).message).toContain(
        'pairing_code_invalid',
      );
      const kiosk = await s.value<{ status: string; secret: string }>(`select public.svc_get_kiosk($1)`, [
        created.kiosk_id,
      ]);
      expect(kiosk).toMatchObject({ status: 'active', secret: paired.secret });
    });
  });

  it('expired pairing codes do not work; only HR creates and revokes kiosks', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const { pairing_code, kiosk_id } = await s.value<{ pairing_code: string; kiosk_id: string }>(
        `select public.create_kiosk($1, 'Tablet')`,
        [seed.sites.milano],
      );
      await s.superuser();
      await s.rows(`update private.kiosk_secrets set pairing_expires_at = now() - interval '1 second'`);
      await s.service();
      expect((await s.error(`select public.svc_pair_kiosk($1)`, [pairing_code])).message).toContain(
        'pairing_code_invalid',
      );

      await s.as(users.marco);
      expect((await s.error(`select public.create_kiosk($1, 'X')`, [seed.sites.milano])).message).toContain('forbidden');
      expect((await s.error(`select public.revoke_kiosk($1)`, [seed.kiosk])).message).toContain('forbidden');
      await s.as(users.francesca);
      expect((await s.error(`select public.create_kiosk($1, 'X')`, [seed.sites.milano])).message).toContain(
        'forbidden',
      );

      await s.as(users.giulia);
      await s.rows(`select public.revoke_kiosk($1)`, [kiosk_id]);
      await s.service();
      expect(await s.value(`select public.svc_get_kiosk($1) ->> 'secret'`, [kiosk_id])).toBeNull();
    });
  });
});

describe('punch corrections', () => {
  const ask = `insert into public.punch_corrections (company_id, member_id, punch_type, requested_ts, reason)
               values ($1, $2, 'in', '2026-10-06T08:00:00Z', 'Telefono scarico') returning id`;

  it('the employee asks, the manager approves, a manual punch appears', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      const { id } = await s.one<{ id: string }>(ask, [seed.aurora, members.marco]);
      expect((await s.error(`select public.decide_punch_correction($1, true)`, [id])).message).toContain('forbidden');
      await s.as(users.anna);
      expect((await s.error(`select public.decide_punch_correction($1, true)`, [id])).message).toContain('forbidden');

      await s.as(users.luca);
      const punchId = await s.value<string>(`select public.decide_punch_correction($1, true, 'ok')`, [id]);
      expect(await s.one(`select method, flags, member_id from public.punches where id = $1`, [punchId])).toEqual({
        method: 'manual',
        flags: ['manual_correction'],
        member_id: members.marco,
      });
      expect((await s.error(`select public.decide_punch_correction($1, false)`, [id])).message).toContain(
        'not_pending',
      );
    });
  });

  it('employees cannot self-approve through the table or ask for colleagues', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      expect(
        (await s.error(
          `insert into public.punch_corrections (company_id, member_id, punch_type, requested_ts, reason, status)
           values ($1, $2, 'in', now(), 'x x x', 'approved')`,
          [seed.aurora, members.marco],
        )).code,
      ).toBe('42501');
      expect((await s.error(ask, [seed.aurora, members.anna])).code).toBe('42501');
      expect(
        (await s.error(
          `insert into public.punch_corrections (company_id, member_id, punch_type, requested_ts, reason)
           values ($1, $2, 'in', now() + interval '1 day', 'futuro')`,
          [seed.aurora, members.marco],
        )).code,
      ).toBe('23514');
    });
  });

  it('only the requester cancels a pending correction', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      const { id } = await s.one<{ id: string }>(ask, [seed.aurora, members.marco]);
      await s.as(users.anna);
      expect((await s.error(`select public.cancel_punch_correction($1)`, [id])).message).toContain('not_found');
      await s.as(users.marco);
      await s.rows(`select public.cancel_punch_correction($1)`, [id]);
      expect(await s.value(`select status from public.punch_corrections where id = $1`, [id])).toBe('cancelled');
    });
  });
});
