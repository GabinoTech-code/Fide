import sodium from 'libsodium-wrappers';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDeviceKeys, verifyPunchSignature } from '@fide/crypto';
import { canonicalPunch } from '@fide/shared';
import { distanceM, evaluateGeofence } from './geofence';
import { MemoryOutboxStore, enqueue, flush, lastPunchType, type SyncResult } from './outbox';
import { buildPunch, uuidFromBytes, type PunchSubmission } from './punch';

beforeAll(async () => {
  await sodium.ready;
});

const milano = { latitude: 45.5048, longitude: 9.2094, radius_m: 150 };

describe('geofence', () => {
  it('measures distances on the sphere', () => {
    // 0.001° of latitude ≈ 111 m everywhere.
    expect(distanceM(milano, { latitude: 45.5058, longitude: 9.2094 })).toBeCloseTo(111.2, 0);
    expect(distanceM(milano, milano)).toBe(0);
  });

  it('inside, outside and the accuracy credit', () => {
    const at = (meters: number, accuracy: number | null) => ({
      latitude: milano.latitude + meters / 111_195,
      longitude: milano.longitude,
      accuracy,
    });
    expect(evaluateGeofence(milano, at(100, 10)).status).toBe('inside');
    expect(evaluateGeofence(milano, at(190, 10)).status).toBe('outside');
    // 190 m with ±45 m accuracy: 150 + 45 ≥ 190 → inside.
    expect(evaluateGeofence(milano, at(190, 45)).status).toBe('inside');
    // The credit is capped at 50 m.
    expect(evaluateGeofence(milano, at(210, 90)).status).toBe('outside');
  });

  it('refuses to decide with a poor fix', () => {
    expect(evaluateGeofence(milano, { ...milano, accuracy: 150 })).toEqual({ status: 'low_accuracy', accuracyM: 150 });
    expect(evaluateGeofence(milano, { ...milano, accuracy: null }).status).toBe('low_accuracy');
  });
});

describe('punch builder', () => {
  const base = {
    companyId: 'a0000000-0000-4000-8000-000000000001',
    memberId: 'a2000000-0000-4000-8000-000000000004',
    deviceKeyId: 'a5000000-0000-4000-8000-000000000004',
    siteId: 'a3000000-0000-4000-8000-000000000001',
  };
  const id = () => uuidFromBytes(sodium.randombytes_buf(16));

  it('signs the canonical payload the server rebuilds', () => {
    const keys = generateDeviceKeys(sodium);
    const p = buildPunch(sodium, { ...base, method: 'geo', punchType: 'in', inGeofence: true }, keys.ed25519PrivateKey, id);
    expect(p.qr_token).toBeNull();
    expect(p.device_ts).toMatch(/\.\d{3}Z$/);
    expect(verifyPunchSignature(sodium, canonicalPunch(p), p.signature, keys.ed25519PublicKey)).toBe(true);
  });

  it('requires the evidence of each method', () => {
    const keys = generateDeviceKeys(sodium);
    expect(() => buildPunch(sodium, { ...base, method: 'geo', punchType: 'in' }, keys.ed25519PrivateKey, id)).toThrow();
    expect(() => buildPunch(sodium, { ...base, method: 'qr', punchType: 'in' }, keys.ed25519PrivateKey, id)).toThrow();
    const qr = buildPunch(
      sodium,
      { ...base, method: 'qr', punchType: 'out', qrToken: 'FIDE1.x', inGeofence: true, mockLocation: true },
      keys.ed25519PrivateKey,
      id,
    );
    expect(qr.in_geofence).toBeNull();
    expect(qr.flags).toEqual(['mock_location']);
  });

  it('generates RFC 4122 v4 ids', () => {
    for (let i = 0; i < 50; i++) {
      expect(id()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});

describe('outbox', () => {
  const punch = (n: number, type: 'in' | 'out' = 'in'): PunchSubmission =>
    ({
      client_punch_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      device_ts: new Date(Date.UTC(2026, 9, 7, 8, n)).toISOString(),
      punch_type: type,
      method: 'qr',
    }) as PunchSubmission;
  const ok = (p: PunchSubmission): SyncResult => ({
    client_punch_id: p.client_punch_id,
    ok: true,
    id: `srv-${p.client_punch_id}`,
    receipt_code: 'REC-000000000001',
    received_at: p.device_ts,
    flags: [],
  });

  it('turns queued punches into receipts', async () => {
    const store = new MemoryOutboxStore();
    await enqueue(store, punch(1));
    const summary = await flush(store, async (ps) => ps.map(ok));
    expect(summary).toEqual({ sent: 1, rejected: [], deferred: false });
    expect(await store.pending()).toEqual([]);
    expect((await store.receipts('2026-10-07'))[0]).toMatchObject({ id: 'srv-' + punch(1).client_punch_id });
  });

  it('keeps everything when the network fails', async () => {
    const store = new MemoryOutboxStore();
    await enqueue(store, punch(1));
    const summary = await flush(store, async () => {
      throw new Error('offline');
    });
    expect(summary.deferred).toBe(true);
    expect(await store.pending()).toMatchObject([{ attempts: 1, rejected: null }]);
  });

  it('marks refused punches and never resends them', async () => {
    const store = new MemoryOutboxStore();
    await enqueue(store, punch(1));
    await enqueue(store, punch(2, 'out'));
    let calls = 0;
    const send = async (ps: PunchSubmission[]) => {
      calls++;
      return ps.map((p): SyncResult => (p === ps[0] ? { client_punch_id: p.client_punch_id, ok: false, error: 'qr_expired' } : ok(p)));
    };
    const summary = await flush(store, send);
    expect(summary.sent).toBe(1);
    expect(summary.rejected).toEqual([{ client_punch_id: punch(1).client_punch_id, error: 'qr_expired' }]);
    await flush(store, send);
    expect(calls).toBe(1);
  });

  it('sends in batches of 50, oldest first', async () => {
    const store = new MemoryOutboxStore();
    for (let i = 59; i >= 0; i--) await enqueue(store, punch(i), 1000 + i);
    const sizes: number[] = [];
    let first = '';
    await flush(store, async (ps) => {
      sizes.push(ps.length);
      first ||= ps[0].client_punch_id;
      return ps.map(ok);
    });
    expect(sizes).toEqual([50, 10]);
    expect(first).toBe(punch(0).client_punch_id);
  });

  it('knows whether the next punch is an in or an out', async () => {
    const store = new MemoryOutboxStore();
    expect(lastPunchType([], [])).toBeNull();
    await enqueue(store, punch(1, 'in'));
    expect(lastPunchType([], await store.pending())).toBe('in');
    await flush(store, async (ps) => ps.map(ok));
    await enqueue(store, punch(9, 'out'));
    expect(lastPunchType(await store.receipts(''), await store.pending())).toBe('out');
  });
});
