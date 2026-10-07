// Fide client-side cryptography. Pure functions over an injected libsodium:
//   portal / Node tests → libsodium-wrappers
//   mobile              → react-native-libsodium (same API; see docs/adr/0002)
//
// Device keys: X25519 (documents) + Ed25519 (punch signatures), generated on the
// phone; private keys never leave it. Documents use the fide-doc-v1 envelope:
//   ciphertext  = XChaCha20-Poly1305(plaintext, file_key, nonce, ad = documentAssociatedData())
//   wrapped_key = crypto_box_seal(file_key, recipient X25519 public key)
import { sha256 } from '@noble/hashes/sha2.js';
import {
  canonicalPunch,
  documentAssociatedData,
  fromBase64,
  toBase64,
  toHex,
  utf8,
  type PunchFields,
} from '@fide/shared';

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/** The subset of the libsodium-wrappers API Fide uses. */
export interface Sodium {
  crypto_box_keypair(): KeyPair;
  crypto_sign_keypair(): KeyPair;
  crypto_sign_detached(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
  crypto_sign_verify_detached(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
  crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
  crypto_box_seal_open(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array;
  // Associated data is passed as a string: react-native-libsodium only accepts
  // strings there (libsodium-wrappers UTF-8-encodes them, so the bytes match).
  crypto_aead_xchacha20poly1305_ietf_encrypt(
    message: Uint8Array,
    additionalData: string,
    secretNonce: null,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  crypto_aead_xchacha20poly1305_ietf_decrypt(
    secretNonce: null,
    ciphertext: Uint8Array,
    additionalData: string,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  randombytes_buf(length: number): Uint8Array;
}

/** Base64 (standard, padded), as stored by the database. */
export interface DeviceKeys {
  x25519PublicKey: string;
  x25519PrivateKey: string;
  ed25519PublicKey: string;
  /** libsodium format: 64 bytes (seed ‖ public key). */
  ed25519PrivateKey: string;
}

export function generateDeviceKeys(sodium: Sodium): DeviceKeys {
  const box = sodium.crypto_box_keypair();
  const sign = sodium.crypto_sign_keypair();
  return {
    x25519PublicKey: toBase64(box.publicKey),
    x25519PrivateKey: toBase64(box.privateKey),
    ed25519PublicKey: toBase64(sign.publicKey),
    ed25519PrivateKey: toBase64(sign.privateKey),
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return toHex(sha256(bytes));
}

/**
 * First 12 bytes of SHA-256(x25519 ‖ ed25519) as uppercase hex in groups of 4,
 * identical to public.key_fingerprint() in the database.
 */
export function keyFingerprint(x25519PublicKey: string, ed25519PublicKey: string): string {
  const x = fromBase64(x25519PublicKey);
  const e = fromBase64(ed25519PublicKey);
  const joined = new Uint8Array(x.length + e.length);
  joined.set(x);
  joined.set(e, x.length);
  const hex = toHex(sha256(joined).subarray(0, 12)).toUpperCase();
  return hex.match(/.{4}/g)!.join(' ');
}

// ---------------------------------------------------------------------------
// Punches
// ---------------------------------------------------------------------------

export interface SignedPunch {
  signedPayload: string;
  signature: string;
}

export function signPunch(sodium: Sodium, fields: PunchFields, ed25519PrivateKey: string): SignedPunch {
  const signedPayload = canonicalPunch(fields);
  const signature = sodium.crypto_sign_detached(utf8(signedPayload), fromBase64(ed25519PrivateKey));
  return { signedPayload, signature: toBase64(signature) };
}

export function verifyPunchSignature(
  sodium: Sodium,
  signedPayload: string,
  signature: string,
  ed25519PublicKey: string,
): boolean {
  try {
    return sodium.crypto_sign_verify_detached(fromBase64(signature), utf8(signedPayload), fromBase64(ed25519PublicKey));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Documents (fide-doc-v1)
// ---------------------------------------------------------------------------

export interface EncryptedDocument {
  ciphertext: Uint8Array;
  nonce: string;
  wrappedKey: string;
  ciphertextSha256: string;
  sizeBytes: number;
}

export function encryptDocument(
  sodium: Sodium,
  input: { documentId: string; memberId: string; plaintext: Uint8Array; recipientX25519PublicKey: string },
): EncryptedDocument {
  const fileKey = sodium.randombytes_buf(32);
  const nonce = sodium.randombytes_buf(24);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    input.plaintext,
    documentAssociatedData(input.documentId, input.memberId),
    null,
    nonce,
    fileKey,
  );
  const wrapped = sodium.crypto_box_seal(fileKey, fromBase64(input.recipientX25519PublicKey));
  fileKey.fill(0);
  return {
    ciphertext,
    nonce: toBase64(nonce),
    wrappedKey: toBase64(wrapped),
    ciphertextSha256: sha256Hex(ciphertext),
    sizeBytes: ciphertext.length,
  };
}

export class DocumentIntegrityError extends Error {
  constructor(reason: string) {
    super(`document cannot be opened: ${reason}`);
    this.name = 'DocumentIntegrityError';
  }
}

export function decryptDocument(
  sodium: Sodium,
  input: {
    documentId: string;
    memberId: string;
    ciphertext: Uint8Array;
    nonce: string;
    wrappedKey: string;
    /** From the documents row; checked before decrypting. */
    ciphertextSha256?: string;
    keys: Pick<DeviceKeys, 'x25519PublicKey' | 'x25519PrivateKey'>;
  },
): Uint8Array {
  if (input.ciphertextSha256 && sha256Hex(input.ciphertext) !== input.ciphertextSha256) {
    throw new DocumentIntegrityError('checksum mismatch');
  }
  let fileKey: Uint8Array;
  try {
    fileKey = sodium.crypto_box_seal_open(
      fromBase64(input.wrappedKey),
      fromBase64(input.keys.x25519PublicKey),
      fromBase64(input.keys.x25519PrivateKey),
    );
  } catch {
    throw new DocumentIntegrityError('not encrypted for this device');
  }
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      input.ciphertext,
      documentAssociatedData(input.documentId, input.memberId),
      fromBase64(input.nonce),
      fileKey,
    );
  } catch {
    throw new DocumentIntegrityError('authentication failed');
  } finally {
    fileKey.fill(0);
  }
}

export { runCryptoSelfTest, VECTOR_PUNCH, type SelfTestResult, type SelfTestSodium } from './selftest';
