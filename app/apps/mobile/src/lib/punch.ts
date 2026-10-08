// Builds and signs a punch exactly as punch-sync will rebuild it (canonical v1).
import { signPunch, type Sodium } from '@fide/crypto';
import type { PunchFields, PunchMethod, PunchType } from '@fide/shared';

export interface PunchSubmission extends PunchFields {
  signature: string;
  flags: string[];
}

export interface PunchInput {
  companyId: string;
  memberId: string;
  deviceKeyId: string;
  siteId: string;
  method: PunchMethod;
  punchType: PunchType;
  inGeofence?: boolean;
  qrToken?: string;
  mockLocation?: boolean;
  /** Injected for tests; defaults to now. */
  now?: Date;
}

export function buildPunch(
  sodium: Sodium,
  input: PunchInput,
  ed25519PrivateKey: string,
  newId: () => string,
): PunchSubmission {
  if (input.method === 'geo' && typeof input.inGeofence !== 'boolean') throw new Error('geo punch needs a geofence result');
  if (input.method === 'qr' && !input.qrToken) throw new Error('qr punch needs a kiosk token');
  const fields: PunchFields = {
    client_punch_id: newId(),
    company_id: input.companyId,
    device_key_id: input.deviceKeyId,
    device_ts: (input.now ?? new Date()).toISOString(),
    in_geofence: input.method === 'geo' ? (input.inGeofence as boolean) : null,
    member_id: input.memberId,
    method: input.method,
    punch_type: input.punchType,
    qr_token: input.method === 'qr' ? (input.qrToken as string) : null,
    site_id: input.siteId,
  };
  const { signature } = signPunch(sodium, fields, ed25519PrivateKey);
  return { ...fields, signature, flags: input.mockLocation ? ['mock_location'] : [] };
}

/** RFC 4122 v4 UUID from 16 random bytes (Hermes has no crypto.randomUUID). */
export function uuidFromBytes(bytes: Uint8Array): string {
  const h = Array.from(bytes.slice(0, 16), (x, i) => {
    let v = x;
    if (i === 6) v = (v & 0x0f) | 0x40;
    if (i === 8) v = (v & 0x3f) | 0x80;
    return v.toString(16).padStart(2, '0');
  }).join('');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
}
