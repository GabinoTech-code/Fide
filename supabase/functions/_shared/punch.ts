// punch-sync core: verifies device-signed punches and records them.
//
// Pure TypeScript over WebCrypto and injected I/O, so the exact same code runs
// in the Edge Function (Deno) and in app/packages/db-tests (Node + PGlite).
import {
  canonicalPunch,
  computeKioskMac,
  fromBase64,
  kioskWindow,
  parseKioskToken,
  receiptMessage,
  toBase64,
  toHex,
  utf8,
  type PunchFields,
} from './protocol.ts';

export const MAX_BATCH = 50;
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const SKEW_FLAG_MS = 2 * 60_000;
const LATE_SYNC_MS = 15 * 60_000;
const CLIENT_FLAGS = new Set(['mock_location']);

export interface DeviceKeyInfo {
  id: string;
  company_id: string;
  member_id: string;
  auth_user_id: string | null;
  member_status: string;
  ed25519_public_key: string;
  status: 'active' | 'revoked';
}

export interface KioskInfo {
  kiosk_id: string;
  company_id: string;
  site_id: string;
  status: string;
  secret: string | null;
}

export interface SiteInfo {
  id: string;
  company_id: string;
  geo_enabled: boolean;
}

export interface RecordedPunch {
  id: string;
  receipt_code: string;
  receipt_signature: string;
  received_at: string;
  flags: string[];
  duplicate: boolean;
}

export interface PunchSyncDeps {
  getDeviceKey(id: string): Promise<DeviceKeyInfo | null>;
  getKiosk(id: string): Promise<KioskInfo | null>;
  getSite(id: string): Promise<SiteInfo | null>;
  /** public.svc_record_punch(p) */
  recordPunch(row: Record<string, unknown>): Promise<RecordedPunch>;
  /** Server receipt key (Ed25519, from FIDE_RECEIPT_PRIVATE_KEY). */
  receiptKey: CryptoKey;
  now(): Date;
}

export type PunchResult =
  | ({ client_punch_id: string; ok: true } & RecordedPunch)
  | { client_punch_id: string | null; ok: false; error: string };

class Rejected extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Errors raised by svc_record_punch that are safe to return to the phone.
const DB_ERRORS = ['qr_token_reused', 'kiosk_invalid', 'device_key_invalid', 'member_not_active'];

export async function syncPunches(deps: PunchSyncDeps, authUserId: string, submissions: unknown): Promise<PunchResult[]> {
  if (!Array.isArray(submissions) || submissions.length === 0 || submissions.length > MAX_BATCH) {
    throw new Error(`punches must be an array of 1..${MAX_BATCH}`);
  }
  const results: PunchResult[] = [];
  for (const raw of submissions) {
    const clientId = typeof raw?.client_punch_id === 'string' ? raw.client_punch_id : null;
    try {
      results.push({ client_punch_id: clientId!, ok: true, ...(await syncOne(deps, authUserId, raw)) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const known = err instanceof Rejected ? message : DB_ERRORS.find((code) => message.includes(code));
      if (!known) throw err; // unexpected: let the function return 500 and the phone retry later
      results.push({ client_punch_id: clientId, ok: false, error: known });
    }
  }
  return results;
}

async function syncOne(deps: PunchSyncDeps, authUserId: string, raw: Record<string, unknown>): Promise<RecordedPunch> {
  const { fields, signature, clientFlags } = parseSubmission(raw);

  const key = await deps.getDeviceKey(fields.device_key_id);
  if (
    !key ||
    key.auth_user_id !== authUserId ||
    key.member_id !== fields.member_id ||
    key.company_id !== fields.company_id ||
    key.member_status !== 'active'
  ) {
    throw new Rejected('device_key_invalid');
  }

  const signedPayload = canonicalPunch(fields);
  const publicKey = await crypto.subtle.importKey('raw', fromBase64(key.ed25519_public_key), { name: 'Ed25519' }, false, [
    'verify',
  ]);
  if (!(await crypto.subtle.verify('Ed25519', publicKey, fromBase64(signature), utf8(signedPayload)))) {
    throw new Rejected('signature_invalid');
  }

  const now = deps.now();
  const deviceTs = new Date(fields.device_ts);
  const ageMs = now.getTime() - deviceTs.getTime();
  if (ageMs < -FUTURE_TOLERANCE_MS) throw new Rejected('device_ts_in_future');
  const flags = [...clientFlags];
  if (ageMs < -SKEW_FLAG_MS) flags.push('clock_skew');
  if (ageMs > LATE_SYNC_MS) flags.push('late_sync');

  let kioskId: string | null = null;
  let qrWindow: number | null = null;
  if (fields.method === 'qr') {
    const token = parseKioskToken(fields.qr_token ?? '');
    if (!token) throw new Rejected('qr_invalid');
    const kiosk = await deps.getKiosk(token.kioskId);
    if (!kiosk || kiosk.status !== 'active' || !kiosk.secret || kiosk.company_id !== fields.company_id) {
      throw new Rejected('qr_invalid');
    }
    const expected = await computeKioskMac(fromBase64(kiosk.secret), token.kioskId, token.window);
    if (!constantTimeEqual(expected, token.mac)) throw new Rejected('qr_invalid');
    // The window was signed by the phone together with device_ts: a token
    // photographed earlier or replayed later than one window away is refused.
    if (Math.abs(token.window - kioskWindow(deviceTs.getTime() / 1000)) > 1) throw new Rejected('qr_expired');
    if (fields.site_id !== kiosk.site_id) throw new Rejected('qr_invalid');
    kioskId = kiosk.kiosk_id;
    qrWindow = token.window;
  } else {
    const site = fields.site_id ? await deps.getSite(fields.site_id) : null;
    if (!site || site.company_id !== fields.company_id) throw new Rejected('site_invalid');
    if (!site.geo_enabled) throw new Rejected('geo_disabled');
    if (fields.in_geofence === false) flags.push('outside_geofence');
  }

  const id = crypto.randomUUID();
  const receivedAt = now.toISOString();
  const payloadHash = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(signedPayload))));
  const receiptSignature = new Uint8Array(
    await crypto.subtle.sign('Ed25519', deps.receiptKey, utf8(receiptMessage(id, payloadHash, receivedAt))),
  );

  return deps.recordPunch({
    id,
    company_id: fields.company_id,
    member_id: fields.member_id,
    device_key_id: fields.device_key_id,
    client_punch_id: fields.client_punch_id,
    punch_type: fields.punch_type,
    method: fields.method,
    site_id: fields.site_id,
    kiosk_id: kioskId,
    in_geofence: fields.in_geofence,
    device_ts: fields.device_ts,
    received_at: receivedAt,
    qr_window: qrWindow,
    signed_payload: signedPayload,
    signature,
    receipt_code: `REC-${toHex(crypto.getRandomValues(new Uint8Array(6))).toUpperCase()}`,
    receipt_signature: toBase64(receiptSignature),
    flags,
  });
}

function parseSubmission(raw: Record<string, unknown>) {
  if (typeof raw !== 'object' || raw === null) throw new Rejected('invalid_punch');
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : null);
  const uuid = (k: string) => {
    const v = str(k);
    if (!v || !UUID.test(v)) throw new Rejected('invalid_punch');
    return v;
  };

  const method = str('method');
  const punchType = str('punch_type');
  const deviceTs = str('device_ts');
  const signature = str('signature');
  if ((method !== 'geo' && method !== 'qr') || (punchType !== 'in' && punchType !== 'out')) {
    throw new Rejected('invalid_punch');
  }
  if (!deviceTs || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(deviceTs) || Number.isNaN(Date.parse(deviceTs))) {
    throw new Rejected('invalid_punch');
  }
  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64(signature ?? '');
  } catch {
    throw new Rejected('invalid_punch');
  }
  if (sigBytes.length !== 64) throw new Rejected('invalid_punch');

  const inGeofence = raw.in_geofence;
  const qrToken = str('qr_token');
  if (method === 'geo' && (typeof inGeofence !== 'boolean' || qrToken !== null)) throw new Rejected('invalid_punch');
  if (method === 'qr' && (inGeofence !== null || qrToken === null)) throw new Rejected('invalid_punch');

  const fields: PunchFields = {
    client_punch_id: uuid('client_punch_id'),
    company_id: uuid('company_id'),
    device_key_id: uuid('device_key_id'),
    device_ts: deviceTs,
    in_geofence: method === 'geo' ? (inGeofence as boolean) : null,
    member_id: uuid('member_id'),
    method,
    punch_type: punchType,
    qr_token: qrToken,
    site_id: uuid('site_id'),
  };
  const clientFlags = Array.isArray(raw.flags)
    ? raw.flags.filter((f): f is string => typeof f === 'string' && CLIENT_FLAGS.has(f))
    : [];
  return { fields, signature: signature!, clientFlags };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
