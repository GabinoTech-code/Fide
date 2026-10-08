// End to end: phone signs with libsodium → punch-sync core verifies with
// WebCrypto (as in Deno) → svc_record_punch writes to the real schema.
import sodium from 'libsodium-wrappers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { generateDeviceKeys, signPunch, type DeviceKeys } from '@fide/crypto';
import { fromBase64, makeKioskToken, receiptMessage, toHex, utf8, type PunchFields } from '@fide/shared';
import { syncPunches, type PunchSyncDeps } from '../../../../supabase/functions/_shared/punch.ts';
import { buildPunch, uuidFromBytes } from '../../../apps/mobile/src/lib/punch.ts';
import { createDb, inTx, seed, type Session } from './harness';

let db: PGlite;
let receiptKeys: { privateKey: CryptoKey; publicKey: CryptoKey };
beforeAll(async () => {
  await sodium.ready;
  receiptKeys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as unknown as typeof receiptKeys;
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, members } = seed;
// Times are relative to the real clock, because device keys get the database's
// now() as created_at. T0 is a kiosk-window boundary one hour ahead.
const T0 = Math.floor((Date.now() + 3_600_000) / 30_000) * 30_000;
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const NOW = new Date(T0 + 30_000);

function deps(s: Session, now = NOW): PunchSyncDeps {
  // Each PostgREST RPC runs in its own transaction; a savepoint gives the same
  // isolation here, so a raised error does not abort the whole test.
  const svc = async <T>(sql: string, params: unknown[]) => {
    await s.service();
    return s.savepoint(() => s.value<T>(sql, params));
  };
  return {
    getDeviceKey: (id) => svc(`select public.svc_get_device_key($1)`, [id]),
    getKiosk: (id) => svc(`select public.svc_get_kiosk($1)`, [id]),
    getSite: (id) => svc(`select to_jsonb(s) from public.sites s where id = $1`, [id]),
    recordPunch: (row) => svc(`select public.svc_record_punch($1::jsonb)`, [JSON.stringify(row)]),
    receiptKey: receiptKeys.privateKey,
    now: () => now,
  };
}

/** Marco enrols a real phone key and returns it with its id. */
async function enrolMarco(s: Session): Promise<{ keys: DeviceKeys; keyId: string }> {
  const keys = generateDeviceKeys(sodium);
  await s.as(users.marco);
  const keyId = await s.value<string>(`select public.register_device_key($1, $2, $3, 'test phone')`, [
    seed.aurora,
    keys.x25519PublicKey,
    keys.ed25519PublicKey,
  ]);
  return { keys, keyId };
}

function geoPunch(keyId: string, over: Partial<PunchFields> = {}): PunchFields {
  return {
    client_punch_id: randomUUID(),
    company_id: seed.aurora,
    device_key_id: keyId,
    device_ts: at(0),
    in_geofence: true,
    member_id: members.marco,
    method: 'geo',
    punch_type: 'in',
    qr_token: null,
    site_id: seed.sites.milano,
    ...over,
  };
}

function signed(fields: PunchFields, keys: DeviceKeys, extra: Record<string, unknown> = {}) {
  return { ...fields, signature: signPunch(sodium, fields, keys.ed25519PrivateKey).signature, ...extra };
}

async function kioskToken(s: Session, unixSeconds: number) {
  await s.service();
  const secret = await s.value<string>(`select public.svc_get_kiosk($1) ->> 'secret'`, [seed.kiosk]);
  return makeKioskToken(fromBase64(secret), seed.kiosk, unixSeconds);
}

describe('punch-sync', () => {
  it('records a signed geo punch with a verifiable server receipt', async () => {
    await inTx(db, async (s) => {
      const { keys, keyId } = await enrolMarco(s);
      const fields = geoPunch(keyId);
      const [result] = await syncPunches(deps(s), users.marco, [signed(fields, keys)]);
      expect(result).toMatchObject({ ok: true, duplicate: false, flags: [] });
      if (!result.ok) return;

      await s.superuser();
      const row = await s.one<{ signed_payload: string; received_at: Date }>(
        `select signed_payload, received_at from public.punches where id = $1`,
        [result.id],
      );
      const payloadHash = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(row.signed_payload))));
      const message = receiptMessage(result.id, payloadHash, NOW.toISOString());
      expect(
        await crypto.subtle.verify('Ed25519', receiptKeys.publicKey, fromBase64(result.receipt_signature), utf8(message)),
      ).toBe(true);

      // Retrying the same punch (e.g. after a timeout) returns the same receipt.
      const [again] = await syncPunches(deps(s), users.marco, [signed(fields, keys)]);
      expect(again).toMatchObject({ ok: true, duplicate: true, id: result.id, receipt_code: result.receipt_code });
    });
  });

  it('rejects tampered punches and punches sent with someone else\'s session', async () => {
    await inTx(db, async (s) => {
      const { keys, keyId } = await enrolMarco(s);
      const fields = geoPunch(keyId);
      const forged = { ...signed(fields, keys), punch_type: 'out' };
      const results = await syncPunches(deps(s), users.marco, [forged]);
      expect(results).toEqual([{ client_punch_id: fields.client_punch_id, ok: false, error: 'signature_invalid' }]);

      const stolen = await syncPunches(deps(s), users.anna, [signed(geoPunch(keyId), keys)]);
      expect(stolen[0]).toMatchObject({ ok: false, error: 'device_key_invalid' });

      // A key that has been replaced by a new phone cannot sign new punches.
      const old = { keys, keyId };
      await enrolMarco(s);
      const late = await syncPunches(deps(s), users.marco, [signed(geoPunch(old.keyId), old.keys)]);
      expect(late[0]).toMatchObject({ ok: false, error: 'device_key_invalid' });
    });
  });

  it('enforces QR-only sites, flags the outside-geofence case and keeps only known client flags', async () => {
    await inTx(db, async (s) => {
      const { keys, keyId } = await enrolMarco(s);
      const results = await syncPunches(deps(s), users.marco, [
        signed(geoPunch(keyId, { site_id: seed.sites.magazzino }), keys),
        signed(geoPunch(keyId, { in_geofence: false }), keys, { flags: ['mock_location', 'trusted'] }),
      ]);
      expect(results[0]).toMatchObject({ ok: false, error: 'geo_disabled' });
      expect(results[1]).toMatchObject({ ok: true, flags: ['mock_location', 'outside_geofence'] });
    });
  });

  it('flags late syncs and refuses timestamps from the future', async () => {
    await inTx(db, async (s) => {
      const { keys, keyId } = await enrolMarco(s);
      const results = await syncPunches(deps(s, new Date(T0 + 3_600_000)), users.marco, [
        signed(geoPunch(keyId, { device_ts: at(0) }), keys),
        signed(geoPunch(keyId, { device_ts: at(4_200_000), punch_type: 'out' }), keys),
      ]);
      expect(results[0]).toMatchObject({ ok: true, flags: ['late_sync'] });
      expect(results[1]).toMatchObject({ ok: false, error: 'device_ts_in_future' });
    });
  });

  it('accepts a fresh kiosk QR once and refuses forged, stale or replayed ones', async () => {
    await inTx(db, async (s) => {
      const { keys, keyId } = await enrolMarco(s);
      const unix = T0 / 1000;
      const token = await kioskToken(s, unix);
      const qr = (over: Partial<PunchFields> = {}) =>
        geoPunch(keyId, { method: 'qr', in_geofence: null, qr_token: token, site_id: seed.sites.magazzino, ...over });

      const results = await syncPunches(deps(s), users.marco, [
        signed(qr(), keys),
        signed(qr(), keys), // same window again, new client id
        signed(qr({ device_ts: at(-300_000) }), keys), // photo taken 5 minutes earlier
        signed(qr({ qr_token: token.slice(0, -3) + 'AAA' }), keys),
        signed(qr({ site_id: seed.sites.milano }), keys),
      ]);
      expect(results.map((r) => (r.ok ? 'ok' : r.error))).toEqual([
        'ok',
        'qr_token_reused',
        'qr_expired',
        'qr_invalid',
        'qr_invalid',
      ]);

      await s.as(users.giulia);
      await s.rows(`select public.revoke_kiosk($1)`, [seed.kiosk]);
      const revoked = await syncPunches(deps(s), users.marco, [signed(qr({ punch_type: 'out' }), keys)]);
      expect(revoked[0]).toMatchObject({ ok: false, error: 'qr_invalid' });
    });
  });

  it('accepts punches built by the mobile app code (QR and geo)', async () => {
    await inTx(db, async (s) => {
      const { keys, keyId } = await enrolMarco(s);
      const newId = () => uuidFromBytes(sodium.randombytes_buf(16));
      const base = { companyId: seed.aurora, memberId: members.marco, deviceKeyId: keyId };
      const qrToken = await kioskToken(s, T0 / 1000);
      const qr = buildPunch(
        sodium,
        { ...base, siteId: seed.sites.magazzino, method: 'qr', punchType: 'in', qrToken, now: new Date(T0 + 5_000) },
        keys.ed25519PrivateKey,
        newId,
      );
      const geo = buildPunch(
        sodium,
        { ...base, siteId: seed.sites.milano, method: 'geo', punchType: 'out', inGeofence: true, now: new Date(T0 + 20_000) },
        keys.ed25519PrivateKey,
        newId,
      );
      const results = await syncPunches(deps(s), users.marco, [qr, geo]);
      expect(results.map((r) => r.ok)).toEqual([true, true]);
    });
  });

  it('validates the batch and every submission', async () => {
    await inTx(db, async (s) => {
      const { keys, keyId } = await enrolMarco(s);
      await expect(syncPunches(deps(s), users.marco, [])).rejects.toThrow();
      await expect(syncPunches(deps(s), users.marco, Array(51).fill({}))).rejects.toThrow();
      const results = await syncPunches(deps(s), users.marco, [
        { nonsense: true },
        { ...signed(geoPunch(keyId), keys), device_ts: at(0).replace('.000Z', 'Z') },
        { ...signed(geoPunch(keyId), keys), signature: 'AAAA' },
        { ...signed(geoPunch(keyId), keys), qr_token: 'FIDE1.x' },
      ]);
      expect(results.map((r) => !r.ok && r.error)).toEqual(['invalid_punch', 'invalid_punch', 'invalid_punch', 'invalid_punch']);
    });
  });

  it('keeps punches signed before a suspension or termination, refuses later ones', async () => {
    await inTx(db, async (s) => {
      const { keys, keyId } = await enrolMarco(s);
      // HR suspends Marco one minute after T0; the phone syncs its queue afterwards.
      await s.superuser();
      await s.rows(`update public.members set status = 'suspended', status_changed_at = $2 where id = $1`, [
        members.marco,
        at(60_000),
      ]);
      const before = signed(geoPunch(keyId, { device_ts: at(0) }), keys);
      const after = signed(geoPunch(keyId, { device_ts: at(90_000), punch_type: 'out' }), keys);
      const results = await syncPunches(deps(s), users.marco, [before, after]);
      expect(results.map((r) => (r.ok ? 'ok' : r.error))).toEqual(['ok', 'member_not_active']);

      // Terminated: same rule.
      await s.superuser();
      await s.rows(
        `update public.members set status = 'terminated', terminated_on = current_date, status_changed_at = $2 where id = $1`,
        [members.marco, at(60_000)],
      );
      const late = signed(geoPunch(keyId, { device_ts: at(30_000), punch_type: 'out' }), keys);
      const [ok] = await syncPunches(deps(s), users.marco, [late]);
      expect(ok).toMatchObject({ ok: true });
    });
  });
});
