// POST /functions/v1/kiosk-pair   { code }   (no JWT: called by the kiosk tablet)
// Exchanges the one-time code from create_kiosk() for the kiosk's HMAC secret.
// The secret is returned once; the kiosk page keeps it in its own storage.
import { handler, HttpError, rpc, serviceClient } from '../_shared/http.ts';

Deno.serve(
  handler((_req, body) => {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    // 8 symbols from a 32-letter alphabet, valid 10 minutes: ~10^12 codes.
    if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) throw new HttpError(400, 'pairing_code_invalid');
    return rpc(serviceClient(), 'svc_pair_kiosk', { p_code: code }, { pairing_code_invalid: 404 });
  }),
);
