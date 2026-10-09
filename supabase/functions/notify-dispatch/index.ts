// POST /functions/v1/notify-dispatch   {}   (header x-fide-dispatch-token)
// Called every minute by pg_cron (private.dispatch_notifications) while e-mails
// are pending; sends them through Brevo. Not a user endpoint: no JWT, only the
// dispatch token that supabase-deploy rotates and stores in Vault.
import { sendMail } from '../_shared/brevo.ts';
import { rpc, serviceClient } from '../_shared/http.ts';
import { dispatchNotifications, sameToken, type ClaimedNotification } from '../_shared/notify.ts';

const portalUrl = Deno.env.get('FIDE_PORTAL_URL') ?? 'https://app.fide-work.it';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const expected = Deno.env.get('FIDE_DISPATCH_TOKEN') ?? '';
  const given = req.headers.get('x-fide-dispatch-token') ?? '';
  if (!expected || !sameToken(given, expected)) return new Response(null, { status: 401 });

  const svc = serviceClient();
  try {
    const result = await dispatchNotifications({
      claim: (limit) => rpc<ClaimedNotification[]>(svc, 'svc_notification_claim', { p_limit: limit }),
      done: async (id, error) => {
        await rpc<null>(svc, 'svc_notification_done', { p_id: id, p_error: error });
      },
      send: sendMail,
      portalUrl,
    });
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
