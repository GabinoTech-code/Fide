// GENERATED from app/packages/shared/src/protocol.ts by app/scripts/sync-shared.mjs — do not edit.

// Fide wire protocols, shared byte-for-byte by the mobile app, the portal, the
// kiosk page and the Edge Functions (copied to supabase/functions/_shared by
// app/scripts/sync-shared.mjs). Keep this file dependency-free and self-contained.

// ---------------------------------------------------------------------------
// Punch v1: what the phone signs with its Ed25519 key
// ---------------------------------------------------------------------------

export const PUNCH_PREFIX = 'FIDE-PUNCH-v1\n';

export type PunchType = 'in' | 'out';
export type PunchMethod = 'geo' | 'qr';

export interface PunchFields {
  client_punch_id: string;
  company_id: string;
  device_key_id: string;
  /** ISO-8601 UTC with milliseconds, e.g. 2026-10-07T07:58:00.000Z */
  device_ts: string;
  /** Only for method "geo": the on-device geofence result. No coordinates, ever. */
  in_geofence: boolean | null;
  member_id: string;
  method: PunchMethod;
  punch_type: PunchType;
  /** Only for method "qr": the scanned kiosk token. */
  qr_token: string | null;
  site_id: string | null;
}

/**
 * The exact string that is signed: prefix + JSON with keys in this fixed
 * (alphabetical) order and every value a string or null. The server rebuilds it
 * from the submitted fields and never trusts a client-supplied string.
 */
export function canonicalPunch(f: PunchFields): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(f.device_ts)) {
    throw new Error('device_ts must be ISO-8601 UTC with milliseconds');
  }
  const obj = {
    client_punch_id: f.client_punch_id,
    company_id: f.company_id,
    device_key_id: f.device_key_id,
    device_ts: f.device_ts,
    in_geofence: f.in_geofence === null ? null : String(f.in_geofence),
    member_id: f.member_id,
    method: f.method,
    punch_type: f.punch_type,
    qr_token: f.qr_token,
    site_id: f.site_id,
    v: '1',
  };
  return PUNCH_PREFIX + JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// Kiosk QR token v1: FIDE1.<kiosk_id>.<window>.<mac>
// ---------------------------------------------------------------------------

export const KIOSK_WINDOW_SECONDS = 30;
export const KIOSK_MAC_LENGTH = 22; // base64url chars ≈ 132 bits of HMAC-SHA256

export function kioskWindow(unixSeconds: number): number {
  return Math.floor(unixSeconds / KIOSK_WINDOW_SECONDS);
}

export function kioskMacInput(kioskId: string, window: number): string {
  return `FIDE-KIOSK-v1|${kioskId}|${window}`;
}

export interface KioskToken {
  kioskId: string;
  window: number;
  mac: string;
}

export function formatKioskToken(t: KioskToken): string {
  return `FIDE1.${t.kioskId}.${t.window}.${t.mac}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseKioskToken(token: string): KioskToken | null {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'FIDE1') return null;
  const [, kioskId, windowText, mac] = parts;
  if (!UUID.test(kioskId) || !/^\d{1,12}$/.test(windowText) || !/^[A-Za-z0-9_-]+$/.test(mac)) return null;
  if (mac.length !== KIOSK_MAC_LENGTH) return null;
  return { kioskId, window: Number(windowText), mac };
}

/** HMAC-SHA256 via WebCrypto (browser kiosk page, Node, Deno). */
export async function computeKioskMac(secret: Uint8Array, kioskId: string, window: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', secret as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(kioskMacInput(kioskId, window))),
  );
  return toBase64Url(mac).slice(0, KIOSK_MAC_LENGTH);
}

export async function makeKioskToken(secret: Uint8Array, kioskId: string, unixSeconds: number): Promise<string> {
  const window = kioskWindow(unixSeconds);
  return formatKioskToken({ kioskId, window, mac: await computeKioskMac(secret, kioskId, window) });
}

// ---------------------------------------------------------------------------
// Server receipt v1 and document envelope
// ---------------------------------------------------------------------------

export function receiptMessage(punchId: string, signedPayloadSha256Hex: string, receivedAt: string): string {
  return `FIDE-RECEIPT-v1|${punchId}|${signedPayloadSha256Hex}|${receivedAt}`;
}

export const DOC_FORMAT = 'fide-doc-v1';

/** AEAD associated data: binds a ciphertext to its document row and recipient. */
export function documentAssociatedData(documentId: string, memberId: string): string {
  return `${DOC_FORMAT}|${documentId}|${memberId}`;
}

export function documentStoragePath(companyId: string, memberId: string, documentId: string): string {
  return `${companyId}/${memberId}/${documentId}.bin`;
}

// ---------------------------------------------------------------------------
// Encoding helpers (the database stores standard padded base64 and hex)
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/[\s=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (/[^A-Za-z0-9+/]/.test(clean) || clean.length % 4 === 1) throw new Error('invalid base64');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let j = 0;
  for (const ch of clean) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}
