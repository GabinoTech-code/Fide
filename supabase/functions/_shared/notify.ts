// notify-dispatch core: turns claimed outbox rows into e-mails and reports each
// result. Pure TypeScript with injected I/O, so the same code runs in the Edge
// Function (Deno) and in app/packages/db-tests (Node + PGlite).
//
// The texts never name the kind of absence (a sick leave is health data) nor
// the content of a document: they only say that something is waiting in Fide.

export type NotificationKind =
  | 'leave_requested'
  | 'correction_requested'
  | 'request_decided'
  | 'gdpr_requested'
  | 'gdpr_answered'
  | 'document_published';

export interface ClaimedNotification {
  id: number;
  kind: NotificationKind;
  email: string;
  recipient_name: string;
  language: string;
  company: string;
  /** The requester, for e-mails to HR. */
  subject_name: string | null;
  /** gdpr_requested: due date (timestamptz); document_published: batch kind. */
  extra: string | null;
}

export interface NotifyDeps {
  claim(limit: number): Promise<ClaimedNotification[]>;
  done(id: number, error: string | null): Promise<void>;
  /** Sends one e-mail; resolves to null when accepted, otherwise a short error code. */
  send(mail: { to: string; toName: string; subject: string; text: string }): Promise<string | null>;
  portalUrl: string;
}

export const LANGUAGES = ['it', 'es', 'en', 'ro', 'ar', 'sq', 'uk', 'fr', 'zh'] as const;
type Lang = (typeof LANGUAGES)[number];

interface Texts {
  subject: Record<NotificationKind, string>;
  body: Record<NotificationKind, string>;
  docKind: Record<'cedolino' | 'cu' | 'other', string>;
  footer: string;
}

// {name} requester · {company} · {portal} portal URL · {due} deadline · {doc} document kind
const TEXTS: Record<Lang, Texts> = {
  it: {
    subject: {
      leave_requested: 'Nuova richiesta da {name}',
      correction_requested: 'Correzione di timbratura da {name}',
      request_decided: 'La tua richiesta è stata gestita',
      gdpr_requested: 'Nuova richiesta privacy da {name}',
      gdpr_answered: 'Risposta alla tua richiesta privacy',
      document_published: 'Nuovo documento in Fide',
    },
    body: {
      leave_requested: '{name} ha inviato una richiesta in Fide. Puoi gestirla nel portale: {portal}/richieste',
      correction_requested: '{name} ha chiesto di correggere una timbratura. Puoi gestirla nel portale: {portal}/richieste',
      request_decided: '{company} ha gestito una tua richiesta. Apri l’app Fide per vedere l’esito.',
      gdpr_requested:
        '{name} ha inviato una richiesta sui propri dati personali. La legge chiede di rispondere entro il {due}. Gestiscila nel portale: {portal}/privacy',
      gdpr_answered: '{company} ha risposto alla tua richiesta privacy. Apri l’app Fide (I miei dati) per leggere la risposta.',
      document_published: '{company} ti ha inviato un documento ({doc}). Si apre solo nell’app Fide sul tuo telefono.',
    },
    docKind: { cedolino: 'cedolino', cu: 'Certificazione Unica', other: 'documento' },
    footer: 'Ricevi questa e-mail perché lavori con {company} su Fide. Non rispondere a questo messaggio.',
  },
  es: {
    subject: {
      leave_requested: 'Nueva solicitud de {name}',
      correction_requested: 'Corrección de fichaje de {name}',
      request_decided: 'Tu solicitud ha sido gestionada',
      gdpr_requested: 'Nueva solicitud de privacidad de {name}',
      gdpr_answered: 'Respuesta a tu solicitud de privacidad',
      document_published: 'Nuevo documento en Fide',
    },
    body: {
      leave_requested: '{name} ha enviado una solicitud en Fide. Puedes gestionarla en el portal: {portal}/richieste',
      correction_requested: '{name} ha pedido corregir un fichaje. Puedes gestionarlo en el portal: {portal}/richieste',
      request_decided: '{company} ha gestionado una solicitud tuya. Abre la app Fide para ver el resultado.',
      gdpr_requested:
        '{name} ha enviado una solicitud sobre sus datos personales. La ley pide responder antes del {due}. Gestiónala en el portal: {portal}/privacy',
      gdpr_answered: '{company} ha respondido a tu solicitud de privacidad. Abre la app Fide (Mis datos) para leer la respuesta.',
      document_published: '{company} te ha enviado un documento ({doc}). Solo se abre en la app Fide de tu móvil.',
    },
    docKind: { cedolino: 'nómina', cu: 'Certificazione Unica', other: 'documento' },
    footer: 'Recibes este e-mail porque trabajas con {company} en Fide. No respondas a este mensaje.',
  },
  en: {
    subject: {
      leave_requested: 'New request from {name}',
      correction_requested: 'Punch correction from {name}',
      request_decided: 'Your request has been handled',
      gdpr_requested: 'New privacy request from {name}',
      gdpr_answered: 'Answer to your privacy request',
      document_published: 'New document in Fide',
    },
    body: {
      leave_requested: '{name} sent a request in Fide. You can handle it in the portal: {portal}/richieste',
      correction_requested: '{name} asked to correct a punch. You can handle it in the portal: {portal}/richieste',
      request_decided: '{company} has handled one of your requests. Open the Fide app to see the outcome.',
      gdpr_requested:
        '{name} sent a request about their personal data. The law asks for an answer by {due}. Handle it in the portal: {portal}/privacy',
      gdpr_answered: '{company} has answered your privacy request. Open the Fide app (My data) to read the answer.',
      document_published: '{company} sent you a document ({doc}). It only opens in the Fide app on your phone.',
    },
    docKind: { cedolino: 'payslip', cu: 'Certificazione Unica', other: 'document' },
    footer: 'You receive this e-mail because you work with {company} on Fide. Please do not reply to this message.',
  },
  ro: {
    subject: {
      leave_requested: 'Cerere nouă de la {name}',
      correction_requested: 'Corectare de pontaj de la {name}',
      request_decided: 'Cererea ta a fost gestionată',
      gdpr_requested: 'Cerere nouă privind datele personale de la {name}',
      gdpr_answered: 'Răspuns la cererea ta privind datele personale',
      document_published: 'Document nou în Fide',
    },
    body: {
      leave_requested: '{name} a trimis o cerere în Fide. O poți gestiona în portal: {portal}/richieste',
      correction_requested: '{name} a cerut corectarea unui pontaj. Îl poți gestiona în portal: {portal}/richieste',
      request_decided: '{company} a gestionat una dintre cererile tale. Deschide aplicația Fide pentru a vedea rezultatul.',
      gdpr_requested:
        '{name} a trimis o cerere privind datele sale personale. Legea cere un răspuns până pe {due}. Gestioneaz-o în portal: {portal}/privacy',
      gdpr_answered: '{company} a răspuns la cererea ta privind datele personale. Deschide aplicația Fide pentru a citi răspunsul.',
      document_published: '{company} ți-a trimis un document ({doc}). Se deschide doar în aplicația Fide de pe telefonul tău.',
    },
    docKind: { cedolino: 'fluturaș de salariu', cu: 'Certificazione Unica', other: 'document' },
    footer: 'Primești acest e-mail pentru că lucrezi cu {company} prin Fide. Nu răspunde la acest mesaj.',
  },
  ar: {
    subject: {
      leave_requested: 'طلب جديد من {name}',
      correction_requested: 'تصحيح تسجيل حضور من {name}',
      request_decided: 'تمت معالجة طلبك',
      gdpr_requested: 'طلب جديد بشأن البيانات الشخصية من {name}',
      gdpr_answered: 'الرد على طلبك بشأن البيانات الشخصية',
      document_published: 'مستند جديد في Fide',
    },
    body: {
      leave_requested: 'أرسل {name} طلبًا في Fide. يمكنك معالجته في البوابة: {portal}/richieste',
      correction_requested: 'طلب {name} تصحيح تسجيل حضور. يمكنك معالجته في البوابة: {portal}/richieste',
      request_decided: 'عالجت {company} أحد طلباتك. افتح تطبيق Fide لترى النتيجة.',
      gdpr_requested:
        'أرسل {name} طلبًا بشأن بياناته الشخصية. يطلب القانون الرد قبل {due}. عالجه في البوابة: {portal}/privacy',
      gdpr_answered: 'ردّت {company} على طلبك بشأن البيانات الشخصية. افتح تطبيق Fide لقراءة الرد.',
      document_published: 'أرسلت لك {company} مستندًا ({doc}). لا يُفتح إلا في تطبيق Fide على هاتفك.',
    },
    docKind: { cedolino: 'كشف راتب', cu: 'Certificazione Unica', other: 'مستند' },
    footer: 'تصلك هذه الرسالة لأنك تعمل مع {company} عبر Fide. يُرجى عدم الرد عليها.',
  },
  sq: {
    subject: {
      leave_requested: 'Kërkesë e re nga {name}',
      correction_requested: 'Korrigjim regjistrimi nga {name}',
      request_decided: 'Kërkesa jote u trajtua',
      gdpr_requested: 'Kërkesë e re për të dhënat personale nga {name}',
      gdpr_answered: 'Përgjigje për kërkesën tënde për të dhënat personale',
      document_published: 'Dokument i ri në Fide',
    },
    body: {
      leave_requested: '{name} dërgoi një kërkesë në Fide. Mund ta trajtosh në portal: {portal}/richieste',
      correction_requested: '{name} kërkoi korrigjimin e një regjistrimi. Mund ta trajtosh në portal: {portal}/richieste',
      request_decided: '{company} trajtoi një nga kërkesat e tua. Hap aplikacionin Fide për të parë rezultatin.',
      gdpr_requested:
        '{name} dërgoi një kërkesë për të dhënat e veta personale. Ligji kërkon përgjigje deri më {due}. Trajtoje në portal: {portal}/privacy',
      gdpr_answered: '{company} iu përgjigj kërkesës tënde për të dhënat personale. Hap aplikacionin Fide për ta lexuar.',
      document_published: '{company} të dërgoi një dokument ({doc}). Hapet vetëm në aplikacionin Fide në telefonin tënd.',
    },
    docKind: { cedolino: 'fletëpagesë', cu: 'Certificazione Unica', other: 'dokument' },
    footer: 'E merr këtë e-mail sepse punon me {company} në Fide. Mos iu përgjigj këtij mesazhi.',
  },
  uk: {
    subject: {
      leave_requested: 'Новий запит від {name}',
      correction_requested: 'Виправлення відмітки від {name}',
      request_decided: 'Ваш запит опрацьовано',
      gdpr_requested: 'Новий запит щодо персональних даних від {name}',
      gdpr_answered: 'Відповідь на ваш запит щодо персональних даних',
      document_published: 'Новий документ у Fide',
    },
    body: {
      leave_requested: '{name} надіслав(-ла) запит у Fide. Ви можете опрацювати його на порталі: {portal}/richieste',
      correction_requested: '{name} просить виправити відмітку. Ви можете опрацювати це на порталі: {portal}/richieste',
      request_decided: '{company} опрацювала один із ваших запитів. Відкрийте застосунок Fide, щоб побачити результат.',
      gdpr_requested:
        '{name} надіслав(-ла) запит щодо своїх персональних даних. Закон вимагає відповісти до {due}. Опрацюйте його на порталі: {portal}/privacy',
      gdpr_answered: '{company} відповіла на ваш запит щодо персональних даних. Відкрийте застосунок Fide, щоб прочитати відповідь.',
      document_published: '{company} надіслала вам документ ({doc}). Він відкривається лише в застосунку Fide на вашому телефоні.',
    },
    docKind: { cedolino: 'розрахунковий лист', cu: 'Certificazione Unica', other: 'документ' },
    footer: 'Ви отримали цей лист, бо працюєте з {company} у Fide. Не відповідайте на нього.',
  },
  fr: {
    subject: {
      leave_requested: 'Nouvelle demande de {name}',
      correction_requested: 'Correction de pointage de {name}',
      request_decided: 'Votre demande a été traitée',
      gdpr_requested: 'Nouvelle demande sur les données personnelles de {name}',
      gdpr_answered: 'Réponse à votre demande sur vos données',
      document_published: 'Nouveau document dans Fide',
    },
    body: {
      leave_requested: '{name} a envoyé une demande dans Fide. Vous pouvez la traiter dans le portail : {portal}/richieste',
      correction_requested: '{name} a demandé de corriger un pointage. Vous pouvez la traiter dans le portail : {portal}/richieste',
      request_decided: '{company} a traité l’une de vos demandes. Ouvrez l’application Fide pour voir le résultat.',
      gdpr_requested:
        '{name} a envoyé une demande sur ses données personnelles. La loi demande une réponse avant le {due}. Traitez-la dans le portail : {portal}/privacy',
      gdpr_answered: '{company} a répondu à votre demande sur vos données. Ouvrez l’application Fide pour lire la réponse.',
      document_published: '{company} vous a envoyé un document ({doc}). Il ne s’ouvre que dans l’application Fide sur votre téléphone.',
    },
    docKind: { cedolino: 'bulletin de paie', cu: 'Certificazione Unica', other: 'document' },
    footer: 'Vous recevez cet e-mail parce que vous travaillez avec {company} sur Fide. Merci de ne pas y répondre.',
  },
  zh: {
    subject: {
      leave_requested: '{name} 提交了新的申请',
      correction_requested: '{name} 申请更正打卡记录',
      request_decided: '您的申请已处理',
      gdpr_requested: '{name} 提交了新的个人数据申请',
      gdpr_answered: '您的个人数据申请已答复',
      document_published: 'Fide 中有新文件',
    },
    body: {
      leave_requested: '{name} 在 Fide 中提交了一项申请。您可以在门户中处理：{portal}/richieste',
      correction_requested: '{name} 申请更正一条打卡记录。您可以在门户中处理：{portal}/richieste',
      request_decided: '{company} 已处理您的一项申请。请打开 Fide 应用查看结果。',
      gdpr_requested: '{name} 提交了关于其个人数据的申请。法律要求在 {due} 之前答复。请在门户中处理：{portal}/privacy',
      gdpr_answered: '{company} 已答复您的个人数据申请。请打开 Fide 应用查看答复。',
      document_published: '{company} 向您发送了一份文件（{doc}）。它只能在您手机上的 Fide 应用中打开。',
    },
    docKind: { cedolino: '工资单', cu: 'Certificazione Unica', other: '文件' },
    footer: '您收到此邮件是因为您通过 Fide 与 {company} 合作。请勿回复此邮件。',
  },
};

const LOCALE: Record<Lang, string> = {
  it: 'it-IT', es: 'es-ES', en: 'en-GB', ro: 'ro-RO', ar: 'ar', sq: 'sq-AL', uk: 'uk-UA', fr: 'fr-FR', zh: 'zh-CN',
};

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/** Subject and plain-text body of one notification, in the recipient's language (Italian by default). */
export function composeNotification(n: ClaimedNotification, portalUrl: string): { subject: string; text: string } {
  const lang: Lang = (LANGUAGES as readonly string[]).includes(n.language) ? (n.language as Lang) : 'it';
  const t = TEXTS[lang];
  let due = '';
  let doc = '';
  if (n.kind === 'gdpr_requested' && n.extra) {
    due = new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'long', timeZone: 'Europe/Rome' }).format(new Date(n.extra));
  }
  if (n.kind === 'document_published') {
    doc = t.docKind[(n.extra ?? 'other') as keyof Texts['docKind']] ?? t.docKind.other;
  }
  const vars = { name: n.subject_name ?? '', company: n.company, portal: portalUrl.replace(/\/+$/, ''), due, doc };
  return {
    subject: fill(t.subject[n.kind], vars),
    text: `${fill(t.body[n.kind], vars)}\n\n—\n${fill(t.footer, vars)}\n`,
  };
}

/** Claims and sends one batch. Returns how many were sent and how many failed. */
export async function dispatchNotifications(deps: NotifyDeps, limit = 50): Promise<{ sent: number; failed: number }> {
  const rows = await deps.claim(limit);
  let sent = 0;
  let failed = 0;
  for (const n of rows) {
    const { subject, text } = composeNotification(n, deps.portalUrl);
    let error: string | null;
    try {
      error = await deps.send({ to: n.email, toName: n.recipient_name, subject, text });
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 120) : 'send_failed';
    }
    await deps.done(n.id, error);
    if (error) failed++;
    else sent++;
  }
  return { sent, failed };
}

/** Constant-time comparison for the dispatch token. */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
