// POST /functions/v1/notify-dispatch   {}   (header x-fide-dispatch-token)
// Called every minute by pg_cron (private.dispatch_notifications) while e-mails
// are pending; sends them through Brevo. Not a user endpoint: no JWT, only the
// dispatch token that supabase-deploy rotates and stores in Vault.
import { sendMail } from '../_shared/brevo.ts';
import { rpc, serviceClient } from '../_shared/http.ts';
import { dispatchNotifications, sameToken, type ClaimedNotification } from '../_shared/notify.ts';
import { deliverPush, dispatchPush, type PushDelivery } from '../_shared/push.ts';

const portalUrl = Deno.env.get('FIDE_PORTAL_URL') ?? 'https://app.fide-work.it';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const expected = Deno.env.get('FIDE_DISPATCH_TOKEN') ?? '';
  const given = req.headers.get('x-fide-dispatch-token') ?? '';
  if (!expected || !sameToken(given, expected)) return new Response(null, { status: 401 });

  const svc = serviceClient();
  try {
    const results = await Promise.allSettled([dispatchNotifications({
      claim: (limit) => rpc<ClaimedNotification[]>(svc, 'svc_notification_claim', { p_limit: limit }),
      done: async (id, error) => {
        await rpc<null>(svc, 'svc_notification_done', { p_id: id, p_error: error });
      },
      send: sendMail,
      portalUrl,
    }), dispatchPush({
      claim: () => Deno.env.get('FIDE_EXPO_ACCESS_TOKEN')
        ? rpc<PushDelivery[]>(svc, 'svc_push_claim', { p_limit: 20 }) : Promise.resolve([]),
      send: (n) => deliverPush(n, Deno.env.get('FIDE_EXPO_ACCESS_TOKEN') ?? ''),
      done: async (id, result) => {
        await rpc<null>(svc, 'svc_push_done', { p_id: id, p_ticket: result.ticket ?? null,
          p_error: result.error ?? null, p_finished: result.finished ?? false });
      },
    })]);
    if (results.some((r) => r.status === 'rejected')) throw new Error('dispatch_failed');
    const values = results.map((r) => r.status === 'fulfilled' ? r.value : null);
    return new Response(JSON.stringify({ email: values[0], push: values[1] }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
