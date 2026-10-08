// POST /functions/v1/invite-employee   { member_id, send_email?: boolean }   (HR JWT)
// Creates the invitation as the caller (create_invitation authorises HR), and
// optionally e-mails the link through Brevo (EU). The link is always returned so
// HR can also share it by hand (WhatsApp, SMS, QR on paper).
//
// Links point at the public site (https://fide-work.it/invite/<token>): that
// domain serves the app-link association files, so phones with the app open it
// directly; otherwise the site's /invite page offers the fide:// link.
import { handler, HttpError, requireUuid, rpc, userClient } from '../_shared/http.ts';

const siteUrl = Deno.env.get('FIDE_SITE_URL') ?? 'http://localhost:5174';
const brevoKey = Deno.env.get('BREVO_API_KEY');
const sender = { name: 'Fide', email: Deno.env.get('FIDE_MAIL_FROM') ?? 'no-reply@fide.invalid' };

Deno.serve(
  handler(async (req, body) => {
    const memberId = requireUuid(body.member_id, 'member_id');
    const client = userClient(req);
    const token = await rpc<string>(client, 'create_invitation', { p_member_id: memberId }, {
      not_authenticated: 401,
      forbidden: 403,
      not_found: 404,
      member_not_invitable: 409,
      member_email_missing: 422,
    });
    const link = `${siteUrl}/invite/${token}`;

    let emailed = false;
    if (body.send_email === true && brevoKey) {
      const { data, error } = await client
        .from('members')
        .select('full_name, preferred_language, companies(legal_name), member_identities(email)')
        .eq('id', memberId)
        .single();
      if (error || !data) throw new Error(`member lookup: ${error?.message}`);
      const company = (data.companies as unknown as { legal_name: string }).legal_name;
      const email = (data.member_identities as unknown as { email: string }).email;
      emailed = await sendInvitation(email, data.full_name as string, company, link);
    } else if (body.send_email === true) {
      throw new HttpError(501, 'email_not_configured');
    }
    return { link, emailed };
  }),
);

async function sendInvitation(to: string, name: string, company: string, link: string): Promise<boolean> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': brevoKey!, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender,
      to: [{ email: to, name }],
      subject: `${company} ti invita su Fide`,
      textContent:
        `Ciao ${name},\n\n${company} usa Fide per le presenze e i cedolini.\n` +
        `Apri questo link dal telefono per attivare il tuo account (valido 7 giorni):\n\n${link}\n\n` +
        `Accederai con il codice che ti arriverà a questo indirizzo e-mail. Nessuna password.\n`,
    }),
  });
  if (!res.ok) {
    console.error('brevo', res.status, await res.text());
    return false;
  }
  return true;
}
