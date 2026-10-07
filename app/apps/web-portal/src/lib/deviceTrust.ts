// Trust-on-first-use for employees' device keys.
//
// A payslip is encrypted to the public key the server returns, so a tampered
// server (or database) could swap in a key of its own and read the next batch.
// This browser therefore remembers which key it encrypted to for each employee;
// a different key blocks encryption until HR has compared fingerprints with the
// employee's phone (Fide app → Privacy). Fingerprints are recomputed here from
// the public keys and never taken from the server.
import { keyFingerprint } from '@fide/crypto';

export interface TrustedDevice {
  deviceKeyId: string;
  fingerprint: string;
  trustedAt: string;
}

/** member id → the key this browser last encrypted to (or HR verified). */
export type TrustedDevices = Record<string, TrustedDevice>;

export interface PublicDeviceKey {
  id: string;
  x25519_public_key: string;
  ed25519_public_key: string;
  /** Generated column on the server; only compared, never trusted. */
  fingerprint: string;
}

export type TrustState =
  | { kind: 'first_use'; fingerprint: string }
  | { kind: 'trusted'; fingerprint: string }
  | { kind: 'changed'; fingerprint: string; previous: string }
  /** The server's fingerprint does not match its own keys: never encrypt. */
  | { kind: 'mismatch' };

export function evaluateTrust(key: PublicDeviceKey, remembered: TrustedDevice | undefined): TrustState {
  let fingerprint: string;
  try {
    fingerprint = keyFingerprint(key.x25519_public_key, key.ed25519_public_key);
  } catch {
    return { kind: 'mismatch' };
  }
  if (fingerprint !== key.fingerprint) return { kind: 'mismatch' };
  if (!remembered) return { kind: 'first_use', fingerprint };
  if (remembered.deviceKeyId === key.id && remembered.fingerprint === fingerprint) return { kind: 'trusted', fingerprint };
  return { kind: 'changed', fingerprint, previous: remembered.fingerprint };
}

const storageKey = (companyId: string) => `fide.portal.trustedDevices.v1.${companyId}`;

function isTrustedDevices(value: unknown): value is TrustedDevices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(
    (k) =>
      k &&
      typeof k === 'object' &&
      typeof (k as TrustedDevice).deviceKeyId === 'string' &&
      typeof (k as TrustedDevice).fingerprint === 'string' &&
      typeof (k as TrustedDevice).trustedAt === 'string',
  );
}

/** `persistent: false` when this browser cannot keep them (private mode, blocked storage). */
export function loadTrustedDevices(companyId: string): { devices: TrustedDevices; persistent: boolean } {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return { devices: isTrustedDevices(parsed) ? parsed : {}, persistent: true };
  } catch {
    return { devices: {}, persistent: false };
  }
}

/** Merges into what is stored (another tab may have written meanwhile). Returns the merged set. */
export function rememberDevices(companyId: string, entries: TrustedDevices, current: TrustedDevices): TrustedDevices {
  const merged = { ...current, ...loadTrustedDevices(companyId).devices, ...entries };
  try {
    localStorage.setItem(storageKey(companyId), JSON.stringify(merged));
  } catch {
    // Kept for this session only; the page already warns that storage is unavailable.
  }
  return merged;
}
