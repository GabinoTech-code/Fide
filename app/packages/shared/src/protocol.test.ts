import { describe, expect, it } from 'vitest';
import {
  KIOSK_MAC_LENGTH,
  canonicalPunch,
  computeKioskMac,
  documentAssociatedData,
  fromBase64,
  kioskWindow,
  makeKioskToken,
  parseKioskToken,
  toBase64,
  toBase64Url,
  type PunchFields,
} from './protocol';

const fields: PunchFields = {
  client_punch_id: '11111111-1111-4111-8111-111111111111',
  company_id: 'a0000000-0000-4000-8000-000000000001',
  device_key_id: 'a5000000-0000-4000-8000-000000000004',
  device_ts: '2026-10-07T07:58:00.000Z',
  in_geofence: true,
  member_id: 'a2000000-0000-4000-8000-000000000004',
  method: 'geo',
  punch_type: 'in',
  qr_token: null,
  site_id: 'a3000000-0000-4000-8000-000000000001',
};

describe('canonicalPunch', () => {
  it('produces the frozen v1 bytes', () => {
    // If this changes, every stored signature stops verifying: bump to v2 instead.
    expect(canonicalPunch(fields)).toBe(
      'FIDE-PUNCH-v1\n{"client_punch_id":"11111111-1111-4111-8111-111111111111",' +
        '"company_id":"a0000000-0000-4000-8000-000000000001","device_key_id":"a5000000-0000-4000-8000-000000000004",' +
        '"device_ts":"2026-10-07T07:58:00.000Z","in_geofence":"true","member_id":"a2000000-0000-4000-8000-000000000004",' +
        '"method":"geo","punch_type":"in","qr_token":null,"site_id":"a3000000-0000-4000-8000-000000000001","v":"1"}',
    );
  });

  it('does not depend on the order fields are given in', () => {
    const shuffled = Object.fromEntries(Object.entries(fields).reverse()) as unknown as PunchFields;
    expect(canonicalPunch(shuffled)).toBe(canonicalPunch(fields));
  });

  it('requires millisecond UTC timestamps', () => {
    expect(() => canonicalPunch({ ...fields, device_ts: '2026-10-07T07:58:00Z' })).toThrow();
    expect(() => canonicalPunch({ ...fields, device_ts: '2026-10-07T09:58:00.000+02:00' })).toThrow();
  });
});

describe('kiosk token', () => {
  const secret = new Uint8Array(32).fill(42);
  const kioskId = 'a4000000-0000-4000-8000-000000000001';

  it('rotates every 30 seconds', () => {
    expect(kioskWindow(1_790_000_000)).toBe(59_666_666);
    expect(kioskWindow(1_790_000_009)).toBe(59_666_666);
    expect(kioskWindow(1_790_000_010)).toBe(59_666_667);
  });

  it('round-trips through format and parse', async () => {
    const token = await makeKioskToken(secret, kioskId, 1_790_000_000);
    const parsed = parseKioskToken(token);
    expect(parsed).toEqual({ kioskId, window: 59_666_666, mac: await computeKioskMac(secret, kioskId, 59_666_666) });
    expect(parsed?.mac).toHaveLength(KIOSK_MAC_LENGTH);
  });

  it('gives a different MAC per window, kiosk and secret', async () => {
    const base = await computeKioskMac(secret, kioskId, 1);
    expect(await computeKioskMac(secret, kioskId, 2)).not.toBe(base);
    expect(await computeKioskMac(secret, 'a4000000-0000-4000-8000-000000000002', 1)).not.toBe(base);
    expect(await computeKioskMac(new Uint8Array(32).fill(1), kioskId, 1)).not.toBe(base);
  });

  it('rejects malformed tokens', () => {
    for (const bad of ['', 'FIDE1', `FIDE2.${kioskId}.1.${'a'.repeat(22)}`, `FIDE1.not-a-uuid.1.${'a'.repeat(22)}`,
      `FIDE1.${kioskId}.x.${'a'.repeat(22)}`, `FIDE1.${kioskId}.1.short`, `FIDE1.${kioskId}.1.${'a'.repeat(21)}=`]) {
      expect(parseKioskToken(bad), bad).toBeNull();
    }
  });
});

describe('encodings', () => {
  it('base64 matches the platform encoder for every length', () => {
    for (let n = 0; n < 70; n++) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + n) & 0xff);
      const reference = btoa(String.fromCharCode(...bytes));
      expect(toBase64(bytes)).toBe(reference);
      expect(toBase64Url(bytes)).toBe(reference.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
      expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
      expect(Array.from(fromBase64(toBase64Url(bytes)))).toEqual(Array.from(bytes));
    }
    expect(() => fromBase64('a$b=')).toThrow();
  });

  it('binds documents to their row and recipient', () => {
    expect(documentAssociatedData('d', 'm')).toBe('fide-doc-v1|d|m');
  });
});
