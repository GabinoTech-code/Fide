// Cross-platform crypto self-test (spike S1, docs/adr/0002). The expected
// values were produced with libsodium-wrappers 0.8 / libsodium 1.0.22; any
// libsodium binding Fide runs on (react-native-libsodium on the phones) must
// reproduce them exactly. The Node suite runs this too, so the vectors stay true.
import { canonicalPunch, documentAssociatedData, fromBase64, toBase64, utf8, type PunchFields } from '@fide/shared';
import { decryptDocument, encryptDocument, generateDeviceKeys, keyFingerprint, signPunch, verifyPunchSignature, type Sodium } from './core';

export interface SelfTestSodium extends Sodium {
  crypto_box_seed_keypair(seed: Uint8Array): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_sign_seed_keypair(seed: Uint8Array): { publicKey: Uint8Array; privateKey: Uint8Array };
}

export interface SelfTestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export const VECTOR_PUNCH: PunchFields = {
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

const EXPECTED = {
  // crypto_sign_seed_keypair(0x02 × 32)
  ed25519PublicKey: 'gTl3Dqh9F19Wo1Rmw0x+zMuNipG07jeiXfYPW4/Js5Q=',
  punchSignature: 'Znl2cjw9TbXt9G+Lzw1WMnc3pL2pl6xCYa8lJ33c+xaFue6N2LjYeZbWsOKtlANins+HtpF87395itE6xPngCA==',
  // crypto_box_seed_keypair(0x01 × 32)
  x25519PublicKey: 'GxtY3VDqFLYNoXt5DNAnVNlwybq4ZOuzwPMBb+UdP1c=',
  fingerprint: '1274 6CB2 CB7B E7CF B708 FB26',
  // XChaCha20-Poly1305("%PDF-1.7 fide vector", key 0x03 × 32, nonce 0x04 × 24, ad below)
  aeadCiphertext: 'TLO7UroAfdFv5OXcmhYKjrxCncWqX0lqdIMzEr4N+heiQYZO',
  // crypto_box_seal(0x05 × 32) for the X25519 key above (sealed boxes are randomised: we only open it)
  sealed:
    'RKC+iHOr14CWPvvTgUZSIew76LXX/Bgoft1yNQY8Og9RPrwKT7LNxEsVIhO7HtlbFLliH9Ki39H9J0NLtCb4+D/9u7My2NhWrAhlxzCDPIE=',
};

const AEAD_AD = documentAssociatedData('d0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004');

function check(name: string, fn: () => boolean | string): SelfTestResult {
  try {
    const result = fn();
    return result === true ? { name, ok: true } : { name, ok: false, detail: result === false ? 'mismatch' : result };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

const same = (actual: string, expected: string) => actual === expected || `got ${actual}`;

export function runCryptoSelfTest(sodium: SelfTestSodium): SelfTestResult[] {
  const fill = (n: number, v: number) => new Uint8Array(n).fill(v);
  const sign = () => sodium.crypto_sign_seed_keypair(fill(32, 2));
  const box = () => sodium.crypto_box_seed_keypair(fill(32, 1));

  return [
    check('Ed25519 key from seed', () => same(toBase64(sign().publicKey), EXPECTED.ed25519PublicKey)),
    check('Ed25519 punch signature vector', () =>
      same(signPunch(sodium, VECTOR_PUNCH, toBase64(sign().privateKey)).signature, EXPECTED.punchSignature),
    ),
    check('Ed25519 verify (and reject tampering)', () => {
      const payload = canonicalPunch(VECTOR_PUNCH);
      const ok = verifyPunchSignature(sodium, payload, EXPECTED.punchSignature, EXPECTED.ed25519PublicKey);
      const tampered = verifyPunchSignature(sodium, payload + ' ', EXPECTED.punchSignature, EXPECTED.ed25519PublicKey);
      return ok && !tampered;
    }),
    check('X25519 key from seed', () => same(toBase64(box().publicKey), EXPECTED.x25519PublicKey)),
    check('Key fingerprint (SHA-256)', () => same(keyFingerprint(EXPECTED.x25519PublicKey, EXPECTED.ed25519PublicKey), EXPECTED.fingerprint)),
    check('XChaCha20-Poly1305 vector', () => {
      const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        utf8('%PDF-1.7 fide vector'),
        AEAD_AD,
        null,
        fill(24, 4),
        fill(32, 3),
      );
      return same(toBase64(ct), EXPECTED.aeadCiphertext);
    }),
    check('XChaCha20-Poly1305 decrypts, and rejects a wrong associated data', () => {
      const decrypt = (ad: string) =>
        sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, fromBase64(EXPECTED.aeadCiphertext), ad, fill(24, 4), fill(32, 3));
      // The right AD must work first, so a binding error can't pass as a rejection.
      const plain = new TextDecoder().decode(decrypt(AEAD_AD));
      if (plain !== '%PDF-1.7 fide vector') return `decrypted to ${plain}`;
      try {
        decrypt(AEAD_AD + 'x');
        return 'decrypted with the wrong AD';
      } catch {
        return true;
      }
    }),
    check('Sealed box opens the Node vector', () => {
      const k = box();
      const opened = sodium.crypto_box_seal_open(fromBase64(EXPECTED.sealed), k.publicKey, k.privateKey);
      return same(toBase64(opened), toBase64(fill(32, 5)));
    }),
    check('fide-doc-v1 round trip with fresh device keys', () => {
      const keys = generateDeviceKeys(sodium);
      const plaintext = utf8('%PDF-1.7 cedolino di prova');
      const ids = { documentId: 'd0000000-0000-4000-8000-000000000009', memberId: VECTOR_PUNCH.member_id };
      const doc = encryptDocument(sodium, { ...ids, plaintext, recipientX25519PublicKey: keys.x25519PublicKey });
      const back = decryptDocument(sodium, { ...ids, ...doc, keys });
      return same(toBase64(back), toBase64(plaintext));
    }),
  ];
}
