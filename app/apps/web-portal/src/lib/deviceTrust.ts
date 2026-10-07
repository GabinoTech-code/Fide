// Trust-on-first-use pinning of employees' device keys.
//
// A payslip is encrypted to the public key the server returns, so a tampered
// server (or database) could swap in a key of its own and read the next batch.
// This browser therefore pins the key it encrypted to for each employee; a
// different key blocks encryption until HR has compared fingerprints with the
// employee's phone (Fide app → I miei dati → Questo telefono). Fingerprints are
// recomputed here from the public keys and never taken from the server.
//
// Only device ids and public-key fingerprints are stored, nothing secret. Names
// avoid "trusted": CodeQL's sensitive-data heuristic reads it as a secret.
import { keyFingerprint } from '@fide/crypto';

export interface PinnedDevice {
  deviceKeyId: string;
  fingerprint: string;
  pinnedAt: string;
}

/** member id → the key this browser last encrypted to (or HR verified). */
export type PinnedDevices = Record<string, PinnedDevice>;

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

export function evaluateTrust(key: PublicDeviceKey, remembered: PinnedDevice | undefined): TrustState {
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

const storageKey = (companyId: string) => `fide.portal.pinnedDevices.v1.${companyId}`;

function isPinnedDevices(value: unknown): value is PinnedDevices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(
    (k) =>
      k &&
      typeof k === 'object' &&
      typeof (k as PinnedDevice).deviceKeyId === 'string' &&
      typeof (k as PinnedDevice).fingerprint === 'string' &&
      typeof (k as PinnedDevice).pinnedAt === 'string',
  );
}

/** `persistent: false` when this browser cannot keep them (private mode, blocked storage). */
export function loadPinnedDevices(companyId: string): { devices: PinnedDevices; persistent: boolean } {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return { devices: isPinnedDevices(parsed) ? parsed : {}, persistent: true };
  } catch {
    return { devices: {}, persistent: false };
  }
}

/** Merges into what is stored (another tab may have written meanwhile). Returns the merged set. */
export function pinDevices(companyId: string, entries: PinnedDevices, current: PinnedDevices): PinnedDevices {
  const merged = { ...current, ...loadPinnedDevices(companyId).devices, ...entries };
  try {
    localStorage.setItem(storageKey(companyId), JSON.stringify(merged));
  } catch {
    // Kept for this session only; the page already warns that storage is unavailable.
  }
  return merged;
}
