// POST /functions/v1/punch-sync   { punches: PunchSubmission[] }  (employee JWT)
// Verifies each device-signed punch and records it; see _shared/punch.ts.
import { handler, HttpError, requireUser, rpc, serviceClient } from '../_shared/http.ts';
import { syncPunches, type DeviceKeyInfo, type KioskInfo, type RecordedPunch } from '../_shared/punch.ts';
import { fromBase64 } from '../_shared/protocol.ts';

const receiptKeyB64 = Deno.env.get('FIDE_RECEIPT_PRIVATE_KEY');
if (!receiptKeyB64) throw new Error('FIDE_RECEIPT_PRIVATE_KEY is not set (see app/scripts/gen-receipt-key.mjs)');
const receiptKey = await crypto.subtle.importKey('pkcs8', fromBase64(receiptKeyB64), { name: 'Ed25519' }, false, ['sign']);

Deno.serve(
  handler(async (req, body) => {
    const user = await requireUser(req);
    const svc = serviceClient();
    try {
      const results = await syncPunches(
        {
          getDeviceKey: (id) => rpc<DeviceKeyInfo | null>(svc, 'svc_get_device_key', { p_device_key_id: id }),
          getKiosk: (id) => rpc<KioskInfo | null>(svc, 'svc_get_kiosk', { p_kiosk_id: id }),
          getSite: async (id) => {
            const { data, error } = await svc.from('sites').select('id, company_id, geo_enabled').eq('id', id).maybeSingle();
            if (error) throw new Error(error.message);
            return data;
          },
          recordPunch: (row) => rpc<RecordedPunch>(svc, 'svc_record_punch', { p: row }),
          receiptKey,
          now: () => new Date(),
        },
        user.id,
        body.punches,
      );
      return { results };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('punches must be')) throw new HttpError(400, 'invalid_batch');
      throw err;
    }
  }),
);
