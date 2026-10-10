// Generic alerts only. Never accept document data, names, IDs or URLs here.
export interface PushDelivery { id: number; token: string; language: string; ticket: string | null }
export interface PushResult { ticket?: string; error?: string; finished?: boolean }
export const PUSH_TEXTS: Record<string, string> = {
  it: 'Ci sono novità in Fide. Apri l’app per vederle.',
  es: 'Tienes novedades en Fide. Abre la app para verlas.',
  en: 'You have updates in Fide. Open the app to view them.',
  ro: 'Ai noutăți în Fide. Deschide aplicația pentru a le vedea.',
  ar: 'لديك مستجدات في Fide. افتح التطبيق للاطلاع عليها.',
  sq: 'Ke të reja në Fide. Hap aplikacionin për t’i parë.',
  uk: 'У Fide є новини для вас. Відкрийте застосунок, щоб переглянути їх.',
  fr: 'Vous avez des nouveautés dans Fide. Ouvrez l’application pour les consulter.',
  zh: 'Fide 中有新消息。打开应用查看。',
};

export function pushMessage(n: Pick<PushDelivery, 'token' | 'language'>) {
  return { to: n.token, title: 'Fide', body: Object.hasOwn(PUSH_TEXTS, n.language) ? PUSH_TEXTS[n.language] : PUSH_TEXTS.it,
    channelId: 'default', ttl: 300, priority: 'normal' } as const;
}

type Request = typeof fetch;
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
// Never persist Expo's error message: it may echo a device token.
function result(value: unknown, receipt: boolean): PushResult {
  const r = record(value);
  if (r?.status === 'ok') {
    if (receipt) return { finished: true };
    if (typeof r.id === 'string' && r.id.length <= 200) return { ticket: r.id };
  }
  if (r?.status === 'error') {
    const error = record(r.details)?.error;
    const safe = ['DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId', 'InvalidCredentials'];
    const code = typeof error === 'string' && safe.includes(error) ? error : 'expo_rejected';
    return { error: code, finished: receipt || code === 'MessageTooBig' };
  }
  return { error: 'invalid_expo_response' };
}

export async function deliverPush(n: PushDelivery, accessToken: string, request: Request = fetch): Promise<PushResult> {
  if (!accessToken) return { error: 'push_credentials_missing' };
  const endpoint = n.ticket ? 'getReceipts' : 'send';
  try {
    const response = await request(`https://exp.host/--/api/v2/push/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(n.ticket ? { ids: [n.ticket] } : pushMessage(n)),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { error: `expo_http_${response.status}` };
    const body = record(await response.json());
    if (!body || body.errors) return { error: 'invalid_expo_response' };
    if (n.ticket) {
      const receipts = record(body.data);
      return receipts && n.ticket in receipts ? result(receipts[n.ticket], true) : { error: 'receipt_pending' };
    }
    const data: unknown = Array.isArray(body.data) ? body.data[0] : body.data;
    return result(data, false);
  } catch {
    return { error: 'expo_unavailable' };
  }
}

export async function dispatchPush(deps: {
  claim(): Promise<PushDelivery[]>;
  send(n: PushDelivery): Promise<PushResult>;
  done(id: number, result: PushResult): Promise<void>;
}) {
  const rows = await deps.claim();
  let accepted = 0;
  let failed = 0;
  // Small bounded batches keep pg_net's timeout and Expo limits predictable.
  await Promise.all(rows.map(async (n) => {
    const outcome = await deps.send(n);
    await deps.done(n.id, outcome);
    if (outcome.ticket || outcome.finished && !outcome.error) accepted++;
    else if (outcome.error !== 'receipt_pending') failed++;
  }));
  return { accepted, failed };
}
