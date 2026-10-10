// Block 1 · F1/V2 (HR records on behalf of an employee), D1 (withdraw a
// document) and G1 (GDPR inbox).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed, type Session } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

const { users, members } = seed;

async function leaveType(s: Session, code: string) {
  await s.superuser();
  return s.value<string>(`select id from public.leave_types where company_id = $1 and code = $2`, [seed.aurora, code]);
}

describe('HR records a punch on behalf of an employee', () => {
  it('creates an approved, flagged manual punch that the employee sees', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const punch = await s.value<string>(
        `select public.hr_record_punch($1, 'in', now() - interval '2 hours', $2, 'Telefono scarico, entrata confermata dal capo turno')`,
        [members.marco, seed.sites.magazzino],
      );
      await s.as(users.marco);
      const row = await s.one<{ method: string; flags: string[]; reason: string; entered_by: string; status: string }>(
        `select p.method, p.flags, c.reason, c.entered_by, c.status
         from public.punches p join public.punch_corrections c on c.id = p.correction_id where p.id = $1`,
        [punch],
      );
      expect(row).toEqual({
        method: 'manual',
        flags: ['hr_entry', 'manual_correction'],
        reason: 'Telefono scarico, entrata confermata dal capo turno',
        entered_by: members.giulia,
        status: 'approved',
      });
    });
  });

  it('needs a reason, refuses the future, self-entries, employees and other companies', async () => {
    await inTx(db, async (s) => {
      const call = (member: string, reason: string, ts = `now() - interval '1 hour'`) =>
        s.error(`select public.hr_record_punch($1, 'out', ${ts}, null, $2)`, [member, reason]);
      await s.as(users.giulia);
      expect((await call(members.marco, ' ')).message).toContain('reason_required');
      expect((await call(members.marco, 'Uscita', `now() + interval '1 hour'`)).message).toContain('ts_in_future');
      expect((await call(members.giulia, 'Mi registro da sola')).message).toContain('self_entry');
      expect((await call(members.paolo, 'Ancora invitato')).message).toContain('member_not_active');
      await s.as(users.marco);
      expect((await call(members.anna, 'Per una collega')).message).toContain('forbidden');
      await s.as(users.francesca);
      expect((await call(members.marco, 'Altra azienda')).message).toContain('forbidden');
      // The employee still cannot write entered_by himself.
      await s.as(users.marco);
      expect(
        (await s.error(
          `insert into public.punch_corrections (company_id, member_id, punch_type, requested_ts, reason, entered_by)
           values ($1, $2, 'in', now(), 'Mi approvo', $3)`,
          [seed.aurora, members.marco, members.giulia],
        )).code,
      ).toBe('42501');
    });
  });

  it('covers a former employee up to the last day only', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      await s.rows(`select public.set_member_status($1, 'terminated', current_date - 3)`, [members.marco]);
      expect(
        await s.value(`select public.hr_record_punch($1, 'out', (current_date - 3) + time '17:00', null, 'Ultimo giorno')`, [
          members.marco,
        ]),
      ).toBeTruthy();
      expect(
        (await s.error(`select public.hr_record_punch($1, 'in', now() - interval '1 hour', null, 'Dopo la cessazione')`, [
          members.marco,
        ])).message,
      ).toContain('member_not_active');
    });
  });
});

describe('HR records an absence on behalf of an employee', () => {
  it('sick leave with the INPS protocol is approved at once and shown as entered by HR', async () => {
    await inTx(db, async (s) => {
      const malattia = await leaveType(s, 'MALATTIA');
      await s.as(users.giulia);
      expect(
        (await s.error(`select public.hr_record_leave($1, $2, '2026-10-12', '2026-10-14', 3, 'Certificato ricevuto')`, [
          members.marco,
          malattia,
        ])).message,
      ).toContain('protocol_required');
      const id = await s.value<string>(
        `select public.hr_record_leave($1, $2, '2026-10-12', '2026-10-14', 3, 'Certificato ricevuto', '123456789')`,
        [members.marco, malattia],
      );
      await s.as(users.marco);
      expect(
        await s.one(`select status, entered_by, decided_by, protocol_number from public.leave_requests where id = $1`, [id]),
      ).toEqual({ status: 'approved', entered_by: members.giulia, decided_by: members.giulia, protocol_number: '123456789' });
    });
  });

  it('counts against the balance and keeps the same guards as punches', async () => {
    await inTx(db, async (s) => {
      const ferie = await leaveType(s, 'FERIE');
      await s.as(users.giulia);
      await s.rows(`select public.hr_record_leave($1, $2, '2026-08-03', '2026-08-07', 5, 'Ferie concordate a voce')`, [
        members.marco,
        ferie,
      ]);
      expect(
        await s.value(`select used from public.leave_balance_summary where member_id = $1 and code = 'FERIE' and year = 2026`, [
          members.marco,
        ]),
      ).toBe('5.00');
      expect((await s.error(`select public.hr_record_leave($1, $2, '2026-08-03', '2026-08-03', 1, 'x')`, [members.marco, ferie])).message).toContain(
        'reason_required',
      );
      expect((await s.error(`select public.hr_record_leave($1, $2, '2026-08-03', '2026-08-03', 1, 'Per me')`, [members.giulia, ferie])).message).toContain(
        'self_entry',
      );
      await s.as(users.luca); // a manager is not HR
      expect((await s.error(`select public.hr_record_leave($1, $2, '2026-08-03', '2026-08-03', 1, 'Dal capo')`, [members.marco, ferie])).message).toContain(
        'forbidden',
      );
    });
  });
});

describe('withdraw_document', () => {
  async function sendToMarco(s: Session) {
    const doc = randomUUID();
    const path = `${seed.aurora}/${members.marco}/${doc}.bin`;
    await s.as(users.giulia);
    const batch = await s.value<string>(`select public.create_payroll_batch($1, 'cedolino', '2026-10-01', 'Cedolino', $2::jsonb)`, [
      seed.aurora,
      JSON.stringify([
        {
          document_id: doc,
          member_id: members.marco,
          device_key_id: seed.keys.marco,
          nonce: Buffer.alloc(24, 1).toString('base64'),
          ciphertext_sha256: 'a'.repeat(64),
          size_bytes: 1234,
          wrapped_key: Buffer.alloc(80, 2).toString('base64'),
        },
      ]),
    ]);
    await s.rows(`insert into storage.objects (bucket_id, name, metadata) values ('encrypted-documents', $1, jsonb_build_object('size', 1234))`, [path]);
    await s.rows(`select public.publish_payroll_batch($1)`, [batch]);
    return { doc, path };
  }

  it('hides the document, destroys its key wrap and lets HR delete the ciphertext', async () => {
    await inTx(db, async (s) => {
      const { doc, path } = await sendToMarco(s);
      await s.as(users.giulia);
      // Published ciphertext stays out of reach before the withdrawal.
      expect(await s.rows(`delete from storage.objects where name = $1 returning name`, [path])).toEqual([]);

      const res = await s.value<{ storage_path: string; downloaded: boolean; was_published: boolean }>(
        `select public.withdraw_document($1, 'Inviato alla persona sbagliata')`,
        [doc],
      );
      expect(res).toMatchObject({ storage_path: path, downloaded: false, was_published: true });

      await s.as(users.marco);
      expect(await s.rows(`select id from public.documents`)).toEqual([]);
      expect(await s.rows(`select document_id from public.document_key_wraps`)).toEqual([]);
      await s.service();
      expect((await s.error(`select public.svc_document_download($1, $2)`, [doc, users.marco])).message).toContain('not_found');

      await s.as(users.giulia);
      expect(await s.rows(`delete from storage.objects where name = $1 returning name`, [path])).toEqual([{ name: path }]);
      expect(
        await s.one(`select status, withdrawal_reason, withdrawn_by from public.documents where id = $1`, [doc]),
      ).toEqual({ status: 'deleted', withdrawal_reason: 'Inviato alla persona sbagliata', withdrawn_by: members.giulia });
      expect(
        await s.rows(`select event from public.document_access_events where document_id = $1 order by id`, [doc]),
      ).toEqual([{ event: 'published' }, { event: 'deleted' }]);
    });
  });

  it('tells HR when the recipient had already downloaded it (possible breach)', async () => {
    await inTx(db, async (s) => {
      const { doc } = await sendToMarco(s);
      await s.service();
      await s.rows(`select public.svc_document_download($1, $2)`, [doc, users.marco]);
      await s.as(users.giulia);
      expect(await s.value(`select public.withdraw_document($1, 'CF sbagliato') ->> 'downloaded'`, [doc])).toBe('true');
      expect((await s.error(`select public.withdraw_document($1, 'di nuovo')`, [doc])).message).toContain('already_withdrawn');
    });
  });

  it('only HR of the same company, with a reason', async () => {
    await inTx(db, async (s) => {
      const { doc } = await sendToMarco(s);
      await s.as(users.giulia);
      expect((await s.error(`select public.withdraw_document($1, '')`, [doc])).message).toContain('reason_required');
      await s.as(users.marco);
      expect((await s.error(`select public.withdraw_document($1, 'Non lo voglio')`, [doc])).message).toContain('forbidden');
      await s.as(users.francesca);
      expect((await s.error(`select public.withdraw_document($1, 'Altra azienda')`, [doc])).message).toContain('forbidden');
    });
  });
});

describe('GDPR inbox', () => {
  async function fileErasure(s: Session, user: string, member: string) {
    await s.as(user);
    return s.value<string>(
      `insert into public.gdpr_requests (company_id, member_id, kind, details) values ($1, $2, 'erasure', 'Cancellate i miei dati') returning id`,
      [seed.aurora, member],
    );
  }

  it('every request gets a one-month deadline set by the database', async () => {
    await inTx(db, async (s) => {
      const id = await fileErasure(s, users.marco, members.marco);
      await s.superuser();
      expect(
        await s.one(`select status, due_at = created_at + interval '1 month' as one_month from public.gdpr_requests where id = $1`, [id]),
      ).toEqual({ status: 'pending', one_month: true });
    });
  });

  it('closing needs a written answer, the employee reads it, and it cannot be reopened', async () => {
    await inTx(db, async (s) => {
      const id = await fileErasure(s, users.marco, members.marco);
      await s.as(users.giulia);
      expect((await s.error(`select public.resolve_gdpr_request($1, 'rejected')`, [id])).message).toContain('answer_required');
      await s.rows(
        `select public.resolve_gdpr_request($1, 'rejected', 'Le presenze e i cedolini vanno conservati per legge (art. 17.3.b GDPR, LUL 5 anni).')`,
        [id],
      );
      expect((await s.error(`select public.resolve_gdpr_request($1, 'completed', 'Ripensato')`, [id])).message).toContain(
        'already_resolved',
      );
      await s.as(users.marco);
      expect(await s.one(`select status, resolution_note from public.gdpr_requests where id = $1`, [id])).toEqual({
        status: 'rejected',
        resolution_note: 'Le presenze e i cedolini vanno conservati per legge (art. 17.3.b GDPR, LUL 5 anni).',
      });
    });
  });

  it('can be extended once by two months, with a reason, within the first month', async () => {
    await inTx(db, async (s) => {
      const id = await fileErasure(s, users.marco, members.marco);
      await s.as(users.giulia);
      expect((await s.error(`select public.extend_gdpr_request($1, '')`, [id])).message).toContain('reason_required');
      await s.rows(`select public.extend_gdpr_request($1, 'Richiesta complessa: servono i dati del consulente')`, [id]);
      await s.superuser();
      expect(
        await s.one(`select status, due_at = created_at + interval '3 months' as three from public.gdpr_requests where id = $1`, [id]),
      ).toEqual({ status: 'in_progress', three: true });
      await s.as(users.giulia);
      expect((await s.error(`select public.extend_gdpr_request($1, 'Ancora')`, [id])).message).toContain('already_extended');

      const late = await fileErasure(s, users.anna, members.anna);
      await s.superuser();
      await s.rows(`update public.gdpr_requests set due_at = now() - interval '1 day' where id = $1`, [late]);
      await s.as(users.giulia);
      expect((await s.error(`select public.extend_gdpr_request($1, 'Troppo tardi')`, [late])).message).toContain('deadline_passed');
    });
  });

  it('erasure revokes former employee keys after termination already removed push tokens', async () => {
    await inTx(db, async (s) => {
      await s.as(users.marco);
      await s.rows(`select public.register_push_token($1, 'ExponentPushToken[marco1]', 'android')`, [seed.keys.marco]);
      const id = await fileErasure(s, users.marco, members.marco);

      await s.as(users.giulia);
      expect((await s.error(`select public.gdpr_erase_former_member($1, 'Fatto')`, [id])).message).toContain(
        'member_not_terminated',
      );
      await s.rows(`select public.set_member_status($1, 'terminated', current_date)`, [members.marco]);
      await s.superuser();
      expect(await s.value(`select count(*)::int from public.push_tokens`)).toBe(0);
      await s.as(users.giulia);
      expect(await s.value(`select public.gdpr_erase_former_member($1, 'Rimosse le chiavi del telefono e le notifiche.')`, [id])).toEqual({
        revoked_keys: 1,
        deleted_push_tokens: 0,
      });
      await s.superuser();
      expect(await s.value(`select status from public.device_keys where id = $1`, [seed.keys.marco])).toBe('revoked');
      expect(await s.value(`select count(*)::int from public.push_tokens`)).toBe(0);
      expect(await s.value(`select status from public.gdpr_requests where id = $1`, [id])).toBe('completed');
    });
  });

  it('only HR of the same company handles the inbox', async () => {
    await inTx(db, async (s) => {
      const id = await fileErasure(s, users.marco, members.marco);
      for (const user of [users.marco, users.luca, users.francesca]) {
        await s.as(user);
        expect((await s.error(`select public.resolve_gdpr_request($1, 'completed', 'x y z')`, [id])).message).toContain('forbidden');
        expect((await s.error(`select public.extend_gdpr_request($1, 'x y z')`, [id])).message).toContain('forbidden');
      }
      await s.as(users.francesca);
      expect(await s.rows(`select id from public.gdpr_requests`)).toEqual([]);
    });
  });
});
