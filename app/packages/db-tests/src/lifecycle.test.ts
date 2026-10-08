// Block 1 · E1–E3: suspend, reactivate, terminate (with 12 months of read-only
// access to one's own documents) and edit members.
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

const setStatus = (s: Session, member: string, status: string, day: string | null = null) =>
  s.value<{ status: string; reports: number; cancelled_requests: number }>(
    `select public.set_member_status($1, $2::public.member_status, $3::date)`,
    [member, status, day],
  );

async function ferie(s: Session) {
  await s.superuser();
  return s.value<string>(`select id from public.leave_types where company_id = $1 and code = 'FERIE'`, [seed.aurora]);
}

/** Marco asks for leave as himself; returns the error message or 'ok'. */
async function marcoAsksLeave(s: Session, typeId: string, start: string) {
  await s.as(users.marco);
  try {
    await s.savepoint(() =>
      s.rows(
        `insert into public.leave_requests (company_id, member_id, leave_type_id, start_date, end_date, quantity)
         values ($1, $2, $3, $4::date, $4::date, 1)`,
        [seed.aurora, members.marco, typeId, start],
      ),
    );
    return 'ok';
  } catch (err) {
    return (err as Error).message;
  }
}

/** A published payslip for Marco, as HR would send it. */
async function publishedDocFor(s: Session, member = members.marco, key = seed.keys.marco) {
  const doc = randomUUID();
  await s.as(users.giulia);
  const batch = await s.value<string>(`select public.create_payroll_batch($1, 'cedolino', '2026-10-01', 'Cedolino', $2::jsonb)`, [
    seed.aurora,
    JSON.stringify([
      {
        document_id: doc,
        member_id: member,
        device_key_id: key,
        nonce: Buffer.alloc(24, 1).toString('base64'),
        ciphertext_sha256: 'a'.repeat(64),
        size_bytes: 1234,
        wrapped_key: Buffer.alloc(80, 2).toString('base64'),
      },
    ]),
  ]);
  await s.rows(
    `insert into storage.objects (bucket_id, name, metadata) values ('encrypted-documents', $1, jsonb_build_object('size', 1234))`,
    [`${seed.aurora}/${member}/${doc}.bin`],
  );
  await s.rows(`select public.publish_payroll_batch($1)`, [batch]);
  return doc;
}

describe('suspension', () => {
  it('blocks every access and is reversible', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      expect(await setStatus(s, members.marco, 'suspended')).toMatchObject({ status: 'suspended', reports: 0 });
      await s.as(users.marco);
      expect(await s.rows(`select id from public.members`)).toEqual([]);
      expect(await s.rows(`select id from public.punches`)).toEqual([]);

      await s.as(users.giulia);
      await setStatus(s, members.marco, 'active');
      await s.as(users.marco);
      expect(await s.rows(`select id from public.members`)).toEqual([{ id: members.marco }]);
    });
  });

  it('reports how many people still have this person as manager', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      expect(await setStatus(s, members.luca, 'suspended')).toMatchObject({ reports: 2 });
    });
  });
});

describe('termination', () => {
  it('keeps read access to own documents and history for 12 months, no writes', async () => {
    await inTx(db, async (s) => {
      const typeId = await ferie(s);
      const doc = await publishedDocFor(s);
      await s.as(users.giulia);
      await setStatus(s, members.marco, 'terminated', new Date().toISOString().slice(0, 10));

      await s.as(users.marco);
      expect(await s.value(`select status from public.members where id = $1`, [members.marco])).toBe('terminated');
      expect(await s.rows(`select id from public.documents`)).toEqual([{ id: doc }]);
      expect(await s.value(`select count(*)::int from public.document_key_wraps`)).toBe(1);
      expect(await s.rows(`select public.mark_document_opened($1)`, [doc])).toHaveLength(1);
      const exported = await s.value<{ memberships: unknown[] }>(`select public.export_my_data()`);
      expect(exported.memberships).toHaveLength(1);
      // GDPR rights survive the end of the employment.
      await s.rows(`insert into public.gdpr_requests (company_id, member_id, kind) values ($1, $2, 'access')`, [
        seed.aurora,
        members.marco,
      ]);
      // No new requests, corrections or devices.
      expect(await marcoAsksLeave(s, typeId, '2026-12-01')).toContain('row-level security');
      await s.as(users.marco);
      expect(
        (await s.error(`select public.register_device_key($1, $2, $3)`, [
          seed.aurora,
          Buffer.alloc(32, 7).toString('base64'),
          Buffer.alloc(32, 8).toString('base64'),
        ])).message,
      ).toContain('forbidden');

      await s.service();
      expect(await s.value(`select public.svc_document_download($1, $2) ->> 'document_id'`, [doc, users.marco])).toBe(doc);

      // HR can still send the final payslip and next year's CU.
      expect(await publishedDocFor(s)).toBeTruthy();

      // After 12 months the access closes by itself.
      await s.superuser();
      await s.rows(`update public.members set terminated_on = current_date - 400 where id = $1`, [members.marco]);
      await s.as(users.marco);
      expect(await s.rows(`select id from public.documents`)).toEqual([]);
      expect(await s.rows(`select id from public.members`)).toEqual([]);
      await s.service();
      expect((await s.error(`select public.svc_document_download($1, $2)`, [doc, users.marco])).message).toContain('not_found');
      await s.as(users.giulia);
      expect(
        (await s.error(`select public.create_payroll_batch($1, 'cu', '2027-03-01', 'CU', $2::jsonb)`, [
          seed.aurora,
          JSON.stringify([
            {
              document_id: randomUUID(),
              member_id: members.marco,
              device_key_id: seed.keys.marco,
              nonce: Buffer.alloc(24, 1).toString('base64'),
              ciphertext_sha256: 'a'.repeat(64),
              size_bytes: 1234,
              wrapped_key: Buffer.alloc(80, 2).toString('base64'),
            },
          ]),
        ])).message,
      ).toContain('device_key_not_active');
    });
  });

  it('cancels only the leave that would start after the last day', async () => {
    await inTx(db, async (s) => {
      const typeId = await ferie(s);
      const today = new Date().toISOString().slice(0, 10);
      expect(await marcoAsksLeave(s, typeId, '2026-01-05')).toBe('ok');
      expect(await marcoAsksLeave(s, typeId, '2099-08-10')).toBe('ok');
      await s.as(users.giulia);
      expect(await setStatus(s, members.marco, 'terminated', today)).toMatchObject({ cancelled_requests: 1 });
      const rows = await s.rows<{ start_date: Date; status: string }>(
        `select start_date, status from public.leave_requests where member_id = $1 order by start_date`,
        [members.marco],
      );
      expect(rows.map((r) => r.status)).toEqual(['pending', 'cancelled']);
    });
  });

  it('validates the date and who may terminate whom', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      expect((await s.error(`select public.set_member_status($1, 'terminated')`, [members.marco])).message).toContain(
        'termination_date_required',
      );
      expect(
        (await s.error(`select public.set_member_status($1, 'terminated', current_date + 1)`, [members.marco])).message,
      ).toContain('termination_date_invalid');
      // HR cannot terminate the owner, nobody terminates themselves, employees cannot at all.
      expect(
        (await s.error(`select public.set_member_status($1, 'terminated', current_date)`, [members.mario])).message,
      ).toContain('forbidden');
      await s.as(users.mario);
      expect(
        (await s.error(`select public.set_member_status($1, 'terminated', current_date)`, [members.mario])).message,
      ).toContain('forbidden');
      expect(await setStatus(s, members.giulia, 'terminated', new Date().toISOString().slice(0, 10))).toMatchObject({
        status: 'terminated',
      });
      await s.as(users.anna);
      expect(
        (await s.error(`select public.set_member_status($1, 'suspended')`, [members.marco])).message,
      ).toContain('forbidden');
      // Another company's HR cannot touch Aurora's members.
      await s.as(users.francesca);
      expect(
        (await s.error(`select public.set_member_status($1, 'suspended')`, [members.marco])).message,
      ).toContain('forbidden');
    });
  });

  it('a former HR admin loses the portal at once', async () => {
    await inTx(db, async (s) => {
      await s.as(users.mario);
      await setStatus(s, members.giulia, 'terminated', new Date().toISOString().slice(0, 10));
      await s.as(users.giulia);
      expect(await s.rows(`select id from public.members where id <> $1`, [members.giulia])).toEqual([]);
      expect((await s.error(`select public.set_member_status($1, 'suspended')`, [members.marco])).message).toContain(
        'forbidden',
      );
    });
  });
});

describe('update_member', () => {
  const update = (s: Session, member: string, over: Record<string, unknown> = {}) => {
    const v = {
      full_name: 'Marco Colombo',
      email: 'marco.colombo@aurora.test',
      cf: 'CLMMRC88M03D612C',
      number: 'M-7',
      site: seed.sites.milano,
      manager: members.luca,
      lang: 'it',
      ...over,
    };
    return s.rows(`select public.update_member($1, $2, $3, $4, $5, $6, $7, $8)`, [
      member,
      v.full_name,
      v.email,
      v.cf,
      v.number,
      v.site,
      v.manager,
      v.lang,
    ]);
  };

  it('HR corrects name, number, site, manager and language', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      await update(s, members.marco, { full_name: '  Marco A. Colombo ', manager: null, lang: 'ro' });
      expect(
        await s.one(`select full_name, employee_number, site_id, manager_member_id, preferred_language from public.members where id = $1`, [
          members.marco,
        ]),
      ).toEqual({
        full_name: 'Marco A. Colombo',
        employee_number: 'M-7',
        site_id: seed.sites.milano,
        manager_member_id: null,
        preferred_language: 'ro',
      });
      // Every change is in the audit log.
      expect(
        await s.value(`select count(*)::int from public.audit_log where table_name = 'members' and row_id = $1`, [members.marco]),
      ).toBeGreaterThan(0);
    });
  });

  it('the e-mail can be corrected only while invited, and that revokes the old invitation', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      expect((await s.error(`select public.update_member($1, 'Marco', 'nuovo@aurora.test', null, null, null, null, 'it')`, [
        members.marco,
      ])).message).toContain('email_locked');

      await s.rows(`select public.create_invitation($1)`, [members.paolo]);
      await update(s, members.paolo, {
        full_name: 'Paolo Marino',
        email: 'Paolo.Marino@Aurora.test ',
        cf: 'MRNPLA80P10A794D',
        manager: null,
      });
      expect(await s.value(`select email from public.member_identities where member_id = $1`, [members.paolo])).toBe(
        'paolo.marino@aurora.test',
      );
      await update(s, members.paolo, { full_name: 'Paolo Marino', email: 'paolo.m@aurora.test', cf: null, manager: null });
      expect(await s.rows(`select status from public.invitations where member_id = $1`, [members.paolo])).toEqual([
        { status: 'revoked' },
      ]);
    });
  });

  it('rejects bad data and callers without rights', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      expect((await s.error(`select public.update_member($1, 'Marco', 'marco.colombo@aurora.test', 'RSSMRA85T10A562T', null, null, null, 'it')`, [
        members.marco,
      ])).code).toBe('23514');
      expect((await s.error(`select public.update_member($1, 'Marco', 'marco.colombo@aurora.test', null, null, null, $1, 'it')`, [
        members.marco,
      ])).message).toContain('manager_invalid');
      expect((await s.error(`select public.update_member($1, 'Marco', 'marco.colombo@aurora.test', null, null, null, $2, 'it')`, [
        members.marco,
        members.francesca,
      ])).message).toContain('manager_invalid');
      // HR does not edit owners; employees edit nobody; other companies see nothing.
      expect((await s.error(`select public.update_member($1, 'Mario', 'mario.rossi@aurora.test', null, null, null, null, 'it')`, [
        members.mario,
      ])).message).toContain('forbidden');
      await s.as(users.marco);
      expect((await s.error(`select public.update_member($1, 'Anna', 'anna.galli@aurora.test', null, null, null, null, 'it')`, [
        members.anna,
      ])).message).toContain('forbidden');
      await s.as(users.francesca);
      expect((await s.error(`select public.update_member($1, 'Anna', 'anna.galli@aurora.test', null, null, null, null, 'it')`, [
        members.anna,
      ])).message).toContain('forbidden');
    });
  });
});
