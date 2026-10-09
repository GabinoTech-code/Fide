// Transactional e-mail through Brevo (EU). Shared by invite-employee and
// notify-dispatch (Deno only).

export interface Mail {
  to: string;
  toName: string;
  subject: string;
  text: string;
}

/** True when BREVO_API_KEY is configured. */
export const brevoConfigured = () => Boolean(Deno.env.get('BREVO_API_KEY'));

/**
 * Sends one plain-text e-mail. Resolves to null when Brevo accepted it,
 * otherwise to a short error such as "400 missing_parameter: to is missing".
 * Brevo's message is kept only if it does not quote an address, so no
 * personal data reaches the caller.
 */
export async function sendMail(mail: Mail): Promise<string | null> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return 'email_not_configured';
  const sender = { name: 'Fide', email: Deno.env.get('FIDE_MAIL_FROM') ?? 'no-reply@fide.invalid' };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: mail.to, name: mail.toName }], subject: mail.subject, textContent: mail.text }),
  });
  if (res.ok) return null;
  const text = await res.text();
  console.error('brevo', res.status, text);
  let code = '';
  let message = '';
  try {
    const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
    code = String(parsed.code ?? '');
    message = String(parsed.message ?? '');
  } catch {
    // Not JSON: the status alone is enough.
  }
  const detail = message && !message.includes('@') ? `: ${message.slice(0, 80)}` : '';
  return `${res.status}${code ? ` ${code.slice(0, 40)}` : ''}${detail}`;
}
