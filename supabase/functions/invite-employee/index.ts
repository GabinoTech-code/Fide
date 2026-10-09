// POST /functions/v1/invite-employee   { member_id, send_email?: boolean }   (HR JWT)
// Creates the invitation as the caller (create_invitation authorises HR), and
// optionally e-mails the link through Brevo (EU). The link is always returned so
// HR can also share it by hand (WhatsApp, SMS, QR on paper).
//
// Links point at the public site (https://fide-work.it/invite/<token>): that
// domain serves the app-link association files, so phones with the app open it
// directly; otherwise the site's /invite page offers the fide:// link.
import { brevoConfigured, sendMail } from '../_shared/brevo.ts';
import { handler, HttpError, requireUuid, rpc, userClient } from '../_shared/http.ts';

const siteUrl = Deno.env.get('FIDE_SITE_URL') ?? 'http://localhost:5174';

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
    // Brevo's HTTP status and error code (e.g. "401 unauthorized"), never the
    // address or the link: lets HR and us see why an e-mail did not go out.
    let emailError: string | undefined;
    if (body.send_email === true && brevoConfigured()) {
      const { data, error } = await client
        .from('members')
        .select('full_name, preferred_language, companies(legal_name), member_identities(email)')
        .eq('id', memberId)
        .single();
      if (error || !data) throw new Error(`member lookup: ${error?.message}`);
      // PostgREST embeds a related row as an object or as a one-element array,
      // depending on how it reads the foreign key: accept both. Reading only the
      // object shape sent Brevo a recipient without address (400 missing_parameter).
      const company = one<{ legal_name: string }>(data.companies)?.legal_name ?? '';
      const email = one<{ email: string | null }>(data.member_identities)?.email;
      if (!email) throw new HttpError(422, 'member_email_missing');
      emailError = (await sendInvitation(email, data.full_name as string, company, link)) ?? undefined;
      emailed = emailError === undefined;
    } else if (body.send_email === true) {
      throw new HttpError(501, 'email_not_configured');
    }
    return { link, emailed, ...(emailError ? { email_error: emailError } : {}) };
  }),
);

function one<T>(value: unknown): T | null {
  return (Array.isArray(value) ? (value[0] ?? null) : (value ?? null)) as T | null;
}

/** Sends the invitation; resolves to null when Brevo accepted it, otherwise a short error code. */
function sendInvitation(to: string, name: string, company: string, link: string): Promise<string | null> {
  return sendMail({
    to,
    toName: name,
    subject: `${company} ti invita su Fide`,
    text:
      `Ciao ${name},\n\n${company} usa Fide per le presenze e i cedolini.\n` +
      `Apri questo link dal telefono per attivare il tuo account (valido 7 giorni):\n\n${link}\n\n` +
      `Accederai con il codice che ti arriverà a questo indirizzo e-mail. Nessuna password.\n`,
  });
}
