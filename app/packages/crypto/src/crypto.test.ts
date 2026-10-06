import sodium from 'libsodium-wrappers';
import { beforeAll, describe, expect, it } from 'vitest';
import { fromBase64, toBase64, utf8, type PunchFields } from '@fide/shared';
import {
  DocumentIntegrityError,
  decryptDocument,
  encryptDocument,
  generateDeviceKeys,
  keyFingerprint,
  sha256Hex,
  signPunch,
  verifyPunchSignature,
  type DeviceKeys,
} from './index';

beforeAll(async () => {
  await sodium.ready;
});

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

/** Deterministic keys for cross-platform vectors (S1 spike: the phone must match). */
function vectorKeys(): DeviceKeys {
  const box = sodium.crypto_box_seed_keypair(new Uint8Array(32).fill(1));
  const sign = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(2));
  return {
    x25519PublicKey: toBase64(box.publicKey),
    x25519PrivateKey: toBase64(box.privateKey),
    ed25519PublicKey: toBase64(sign.publicKey),
    ed25519PrivateKey: toBase64(sign.privateKey),
  };
}

describe('device keys', () => {
  it('generates 32-byte public keys and a 64-byte Ed25519 secret', () => {
    const k = generateDeviceKeys(sodium);
    expect(fromBase64(k.x25519PublicKey)).toHaveLength(32);
    expect(fromBase64(k.x25519PrivateKey)).toHaveLength(32);
    expect(fromBase64(k.ed25519PublicKey)).toHaveLength(32);
    expect(fromBase64(k.ed25519PrivateKey)).toHaveLength(64);
  });

  it('fingerprints like the database does', () => {
    const k = vectorKeys();
    const joined = new Uint8Array([...fromBase64(k.x25519PublicKey), ...fromBase64(k.ed25519PublicKey)]);
    const expected = sha256Hex(joined).slice(0, 24).toUpperCase().match(/.{4}/g)!.join(' ');
    expect(keyFingerprint(k.x25519PublicKey, k.ed25519PublicKey)).toBe(expected);
    expect(expected).toMatch(/^([0-9A-F]{4} ){5}[0-9A-F]{4}$/);
  });
});

describe('punch signatures', () => {
  it('is deterministic for the cross-platform vector', () => {
    const { signature } = signPunch(sodium, fields, vectorKeys().ed25519PrivateKey);
    expect(signature).toMatchSnapshot();
  });

  it('verifies with libsodium and with WebCrypto Ed25519 (what Deno uses)', async () => {
    const k = generateDeviceKeys(sodium);
    const { signedPayload, signature } = signPunch(sodium, fields, k.ed25519PrivateKey);
    expect(verifyPunchSignature(sodium, signedPayload, signature, k.ed25519PublicKey)).toBe(true);

    const pub = await crypto.subtle.importKey('raw', fromBase64(k.ed25519PublicKey), { name: 'Ed25519' }, false, [
      'verify',
    ]);
    expect(await crypto.subtle.verify('Ed25519', pub, fromBase64(signature), utf8(signedPayload))).toBe(true);
  });

  it('fails for a tampered payload or another key', () => {
    const k = generateDeviceKeys(sodium);
    const other = generateDeviceKeys(sodium);
    const { signedPayload, signature } = signPunch(sodium, fields, k.ed25519PrivateKey);
    expect(verifyPunchSignature(sodium, signedPayload.replace('"in"', '"out"'), signature, k.ed25519PublicKey)).toBe(false);
    expect(verifyPunchSignature(sodium, signedPayload, signature, other.ed25519PublicKey)).toBe(false);
    expect(verifyPunchSignature(sodium, signedPayload, 'not base64!', k.ed25519PublicKey)).toBe(false);
  });
});

describe('fide-doc-v1 documents', () => {
  const ids = { documentId: 'd0000000-0000-4000-8000-000000000001', memberId: 'a2000000-0000-4000-8000-000000000004' };
  const pdf = utf8('%PDF-1.7 cedolino ottobre 2026 netto 1.734,00');

  function seal(keys: DeviceKeys) {
    return encryptDocument(sodium, { ...ids, plaintext: pdf, recipientX25519PublicKey: keys.x25519PublicKey });
  }

  it('round-trips and matches the shapes the database checks', () => {
    const k = generateDeviceKeys(sodium);
    const doc = seal(k);
    expect(fromBase64(doc.nonce)).toHaveLength(24);
    expect(fromBase64(doc.wrappedKey)).toHaveLength(80);
    expect(doc.sizeBytes).toBe(pdf.length + 16);
    expect(doc.ciphertextSha256).toMatch(/^[0-9a-f]{64}$/);
    const plain = decryptDocument(sodium, { ...ids, ...doc, keys: k });
    expect(new TextDecoder().decode(plain)).toBe(new TextDecoder().decode(pdf));
  });

  it('cannot be opened by another device, for another row or after tampering', () => {
    const k = generateDeviceKeys(sodium);
    const doc = seal(k);
    const attempt = (over: Partial<Parameters<typeof decryptDocument>[1]>) => () =>
      decryptDocument(sodium, { ...ids, ...doc, keys: k, ...over });

    expect(attempt({ keys: generateDeviceKeys(sodium) })).toThrow(DocumentIntegrityError);
    expect(attempt({ memberId: 'a2000000-0000-4000-8000-000000000005' })).toThrow(/authentication failed/);
    expect(attempt({ documentId: 'd0000000-0000-4000-8000-000000000002' })).toThrow(/authentication failed/);
    const tampered = doc.ciphertext.slice();
    tampered[3] ^= 1;
    expect(attempt({ ciphertext: tampered })).toThrow(/checksum mismatch/);
    expect(attempt({ ciphertext: tampered, ciphertextSha256: undefined })).toThrow(/authentication failed/);
  });
});
