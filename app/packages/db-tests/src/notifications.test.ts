// Block 2 · N1: e-mail notifications (outbox triggers, claim/done, texts).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  composeNotification,
  dispatchNotifications,
  type ClaimedNotification,
} from '../../../../supabase/functions/_shared/notify.ts';
import { createDb, inTx, seed, type Session } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, members } = seed;

async function outbox(s: Session) {
  await s.superuser();
  return s.rows<{ recipient_member_id: string; kind: string; sent_at: Date | null; attempts: number; last_error: string | null }>(
    `select recipient_member_id, kind, sent_at, attempts, last_error from private.notification_outbox order by id`,
  );
}

async function typeId(s: Session, code: string) {
  await s.superuser();
  return s.value<string>(`select id from public.leave_types where company_id = $1 and code = $2`, [seed.aurora, code]);
}

async function marcoAsks(s: Session, code = 'FERIE') {
  const t = await typeId(s, code);
  await s.as(users.marco);
  return s.value<string>(
    `insert into public.leave_requests (company_id, member_id, leave_type_id, start_date, end_date, quantity, protocol_number)
     values ($1, $2, $3, '2026-11-02', '2026-11-03', 2, $4) returning id`,
    [seed.aurora, members.marco, t, code === 'MALATTIA' ? '987654321' : null],
  );
}

const claim = async (s: Session, limit = 50) => {
  await s.service();
  return s.value<ClaimedNotification[]>(`select public.svc_notification_claim($1)`, [limit]);
};

describe('notification outbox', () => {
  it('a new request notifies HR, owners and the manager, never the requester', async () => {
    await inTx(db, async (s) => {
      await marcoAsks(s);
      const rows = await outbox(s);
      expect(rows.map((r) => r.recipient_member_id).sort()).toEqual([members.mario, members.giulia, members.luca].sort());
      expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(['leave_requested']));
    });
  });

  it('a decision notifies the employee; entries recorded by HR notify nobody', async () => {
    await inTx(db, async (s) => {
      const id = await marcoAsks(s);
      await s.as(users.giulia);
      await s.rows(`select public.decide_leave_request($1, true)`, [id]);
      const decided = (await outbox(s)).filter((r) => r.kind === 'request_decided');
      expect(decided.map((r) => r.recipient_member_id)).toEqual([members.marco]);

      await s.superuser();
      await s.rows(`delete from private.notification_outbox`);
      const ferie = await typeId(s, 'FERIE');
      await s.as(users.giulia);
      await s.rows(`select public.hr_record_leave($1, $2, '2026-12-01', '2026-12-01', 1, 'Concordata')`, [members.anna, ferie]);
      await s.rows(`select public.hr_record_punch($1, 'in', now() - interval '1 hour', null, 'Senza telefono')`, [members.anna]);
      expect(await outbox(s)).toEqual([]);
    });
  });

  it('punch corrections follow the same path', async () => {
    await inTx(db, async (s) => {
      await s.as(users.anna);
      const id = await s.value<string>(
        `insert into public.punch_corrections (company_id, member_id, punch_type, requested_ts, reason)
         values ($1, $2, 'out', now() - interval '3 hours', 'Dimenticata') returning id`,
        [seed.aurora, members.anna],
      );
      expect((await outbox(s)).filter((r) => r.kind === 'correction_requested')).toHaveLength(3);
      await s.as(users.luca);
      await s.rows(`select public.decide_punch_correction($1, false, 'Non risulta')`, [id]);
      expect((await outbox(s)).filter((r) => r.kind === 'request_decided').map((r) => r.recipient_member_id)).toEqual([members.anna]);
    });
  });

  it('GDPR requests go to HR only (not the manager), answers to the employee', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      const id = await s.value<string>(
        `insert into public.gdpr_requests (company_id, member_id, kind) values ($1, $2, 'access') returning id`,
        [seed.aurora, members.marco],
      );
      expect((await outbox(s)).map((r) => r.recipient_member_id).sort()).toEqual([members.mario, members.giulia].sort());
      await s.as(users.giulia);
      await s.rows(`select public.resolve_gdpr_request($1, 'in_progress', 'Presa in carico')`, [id]);
      expect((await outbox(s)).filter((r) => r.kind === 'gdpr_answered')).toEqual([]);
      await s.rows(`select public.resolve_gdpr_request($1, 'completed', 'Esportazione disponibile nell''app')`, [id]);
      expect((await outbox(s)).filter((r) => r.kind === 'gdpr_answered').map((r) => r.recipient_member_id)).toEqual([members.marco]);
    });
  });

  it('a published batch notifies each employee once', async () => {
    await inTx(db, async (s) => {
      const docs = [randomUUID(), randomUUID()];
      const item = (doc: string) => ({
        document_id: doc,
        member_id: members.marco,
        device_key_id: seed.keys.marco,
        nonce: Buffer.alloc(24, 1).toString('base64'),
        ciphertext_sha256: 'a'.repeat(64),
        size_bytes: 1234,
        wrapped_key: Buffer.alloc(80, 2).toString('base64'),
      });
      await s.as(users.giulia);
      const batch = await s.value<string>(`select public.create_payroll_batch($1, 'cedolino', '2026-10-01', 'Ottobre', $2::jsonb)`, [
        seed.aurora,
        JSON.stringify(docs.map(item)),
      ]);
      for (const doc of docs) {
        await s.rows(
          `insert into storage.objects (bucket_id, name, metadata) values ('encrypted-documents', $1, jsonb_build_object('size', 1234))`,
          [`${seed.aurora}/${members.marco}/${doc}.bin`],
        );
      }
      expect(await outbox(s)).toEqual([]); // drafts notify nobody
      await s.rows(`select public.publish_payroll_batch($1)`, [batch]);
      const rows = await outbox(s);
      expect(rows.map((r) => [r.recipient_member_id, r.kind])).toEqual([[members.marco, 'document_published']]);
    });
  });

  it('clients cannot read the outbox or call the dispatcher functions', async () => {
    await inTx(db, async (s) => {
      await marcoAsks(s);
      for (const user of [users.marco, users.giulia]) {
        await s.as(user);
        expect((await s.error(`select * from private.notification_outbox`)).code).toBe('42501');
        expect((await s.error(`select public.svc_notification_claim(10)`)).code).toBe('42501');
        expect((await s.error(`select public.svc_notification_done(1, null)`)).code).toBe('42501');
      }
    });
  });
});

describe('dispatch', () => {
  it('claims each row once, with what the e-mail needs and no address in the outbox', async () => {
    await inTx(db, async (s) => {
      await marcoAsks(s);
      const first = await claim(s);
      expect(first).toHaveLength(3);
      const toGiulia = first.find((n) => n.email === 'giulia.bianchi@aurora.test')!;
      expect(toGiulia).toMatchObject({ kind: 'leave_requested', subject_name: 'Marco Colombo', company: expect.any(String), language: 'it' });
      expect(await claim(s)).toEqual([]); // claimed in the last 5 minutes
      await s.superuser();
      const columns = await s.rows<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'private' and table_name = 'notification_outbox'`,
      );
      expect(columns.map((c) => c.column_name)).not.toContain('email');
    });
  });

  it('marks sent rows, retries failures up to 5 attempts', async () => {
    await inTx(db, async (s) => {
      await marcoAsks(s);
      const sentTo: string[] = [];
      const deps = {
        claim: (limit: number) => claim(s, limit),
        done: async (id: number, error: string | null) => {
          await s.service();
          await s.rows(`select public.svc_notification_done($1, $2)`, [id, error]);
        },
        send: async (mail: { to: string }) => {
          sentTo.push(mail.to);
          return mail.to.startsWith('luca') ? '429 too_many_requests' : null;
        },
        portalUrl: 'https://app.fide-work.it',
      };
      expect(await dispatchNotifications(deps)).toEqual({ sent: 2, failed: 1 });
      let rows = await outbox(s);
      expect(rows.filter((r) => r.sent_at).length).toBe(2);
      const failed = rows.find((r) => !r.sent_at)!;
      expect(failed).toMatchObject({ attempts: 1, last_error: '429 too_many_requests' });

      // The failed one is claimable again (claimed_at was cleared), up to 5 attempts.
      for (let i = 0; i < 6; i++) await dispatchNotifications(deps);
      rows = await outbox(s);
      expect(rows.find((r) => !r.sent_at)!.attempts).toBe(5);
      expect(sentTo.filter((to) => to.startsWith('luca'))).toHaveLength(5);
    });
  });

  it('closes rows whose recipient has no access any more', async () => {
    await inTx(db, async (s) => {
      await marcoAsks(s);
      await s.superuser();
      await s.rows(`update public.members set status = 'suspended', status_changed_at = now() where id = $1`, [members.luca]);
      const claimed = await claim(s);
      expect(claimed.map((n) => n.email).sort()).toEqual(['giulia.bianchi@aurora.test', 'mario.rossi@aurora.test']);
      const toLuca = (await outbox(s)).find((r) => r.recipient_member_id === members.luca)!;
      expect(toLuca).toMatchObject({ last_error: 'no_recipient' });
      expect(toLuca.sent_at).not.toBeNull();
    });
  });
});

describe('texts', () => {
  const base: ClaimedNotification = {
    id: 1,
    kind: 'leave_requested',
    email: 'hr@x.test',
    recipient_name: 'Giulia',
    language: 'it',
    company: 'Aurora S.r.l.',
    subject_name: 'Marco Colombo',
    extra: null,
  };

  it('never names the kind of absence or the content of a document', async () => {
    await inTx(db, async (s) => {
      await marcoAsks(s, 'MALATTIA');
      const rows = await claim(s);
      for (const n of rows) {
        const { subject, text } = composeNotification(n, 'https://app.fide-work.it');
        expect(`${subject} ${text}`.toLowerCase()).not.toMatch(/malatt|sick|enfermedad|987654321/);
        expect(text).toContain('https://app.fide-work.it/richieste');
      }
    });
  });

  it('uses the recipient language, Italian by default, and fills every placeholder', () => {
    const ro = composeNotification({ ...base, language: 'ro' }, 'https://app.fide-work.it/');
    expect(ro.subject).toBe('Cerere nouă de la Marco Colombo');
    const unknown = composeNotification({ ...base, language: 'de' }, 'https://app.fide-work.it');
    expect(unknown.subject).toBe('Nuova richiesta da Marco Colombo');
    const due = composeNotification({ ...base, kind: 'gdpr_requested', extra: '2026-11-08T10:00:00Z' }, 'https://p');
    expect(due.text).toContain('8 novembre 2026');
    const doc = composeNotification({ ...base, kind: 'document_published', language: 'es', extra: 'cedolino', subject_name: null }, 'https://p');
    expect(doc.text).toContain('(nómina)');
    for (const lang of ['it', 'es', 'en', 'ro', 'ar', 'sq', 'uk', 'fr', 'zh']) {
      for (const kind of ['leave_requested', 'correction_requested', 'request_decided', 'gdpr_requested', 'gdpr_answered', 'document_published'] as const) {
        const { subject, text } = composeNotification({ ...base, kind, language: lang, extra: kind === 'gdpr_requested' ? '2026-11-08T10:00:00Z' : 'cu' }, 'https://p');
        expect(`${subject}${text}`, `${lang}/${kind}`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
