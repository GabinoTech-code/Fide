import sodium from 'libsodium-wrappers';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateDeviceKeys, keyFingerprint, type Sodium } from '@fide/crypto';
import { evaluateTrust, loadPinnedDevices, pinDevices, type PublicDeviceKey } from './deviceTrust';

let s: Sodium;
beforeAll(async () => {
  await sodium.ready;
  s = sodium as unknown as Sodium;
});

function serverKey(id: string): PublicDeviceKey {
  const k = generateDeviceKeys(s);
  return {
    id,
    x25519_public_key: k.x25519PublicKey,
    ed25519_public_key: k.ed25519PublicKey,
    fingerprint: keyFingerprint(k.x25519PublicKey, k.ed25519PublicKey),
  };
}

describe('evaluateTrust', () => {
  it('trusts on first use, then only the same key', () => {
    const key = serverKey('k1');
    expect(evaluateTrust(key, undefined)).toEqual({ kind: 'first_use', fingerprint: key.fingerprint });
    const remembered = { deviceKeyId: 'k1', fingerprint: key.fingerprint, pinnedAt: '2026-10-01T00:00:00Z' };
    expect(evaluateTrust(key, remembered)).toEqual({ kind: 'trusted', fingerprint: key.fingerprint });

    const newPhone = serverKey('k2');
    expect(evaluateTrust(newPhone, remembered)).toEqual({ kind: 'changed', fingerprint: newPhone.fingerprint, previous: key.fingerprint });
  });

  it('flags a key swapped in place under the same id', () => {
    const key = serverKey('k1');
    const remembered = { deviceKeyId: 'k1', fingerprint: key.fingerprint, pinnedAt: '2026-10-01T00:00:00Z' };
    const attacker = serverKey('k1');
    expect(evaluateTrust(attacker, remembered).kind).toBe('changed');
  });

  it('never trusts the server-supplied fingerprint', () => {
    const key = serverKey('k1');
    const other = serverKey('k9');
    // The server shows the old fingerprint next to a substituted X25519 key.
    expect(evaluateTrust({ ...key, x25519_public_key: other.x25519_public_key }, undefined)).toEqual({ kind: 'mismatch' });
    expect(evaluateTrust({ ...key, x25519_public_key: 'not base64!' }, undefined)).toEqual({ kind: 'mismatch' });
  });
});

describe('trusted key storage', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  function fakeStorage(): Storage {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, String(v)),
    };
  }

  it('reports when the browser cannot persist (blocked storage)', () => {
    const blocked = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    (globalThis as { localStorage?: Storage }).localStorage = { ...fakeStorage(), getItem: blocked, setItem: blocked };
    expect(loadPinnedDevices('c1')).toEqual({ devices: {}, persistent: false });
    // Still usable for the session.
    const merged = pinDevices('c1', { m1: { deviceKeyId: 'k1', fingerprint: 'F', pinnedAt: 't' } }, {});
    expect(merged.m1.deviceKeyId).toBe('k1');
  });

  it('round-trips per company and merges with other tabs', () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
    pinDevices('c1', { m1: { deviceKeyId: 'k1', fingerprint: 'F1', pinnedAt: 't' } }, {});
    // Another tab adds m2 meanwhile; this tab's in-memory copy only knows m1.
    pinDevices('c1', { m2: { deviceKeyId: 'k2', fingerprint: 'F2', pinnedAt: 't' } }, {});
    const { devices, persistent } = loadPinnedDevices('c1');
    expect(persistent).toBe(true);
    expect(Object.keys(devices).sort()).toEqual(['m1', 'm2']);
    expect(loadPinnedDevices('c2').devices).toEqual({});
  });

  it('ignores corrupted entries instead of trusting them', () => {
    const storage = fakeStorage();
    (globalThis as { localStorage?: Storage }).localStorage = storage;
    storage.setItem('fide.portal.pinnedDevices.v1.c1', JSON.stringify({ m1: { deviceKeyId: 1 } }));
    expect(loadPinnedDevices('c1')).toEqual({ devices: {}, persistent: true });
    storage.setItem('fide.portal.pinnedDevices.v1.c1', '{not json');
    expect(loadPinnedDevices('c1').devices).toEqual({});
  });
});
