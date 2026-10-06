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

function item(member: string, key: string, overrides: Record<string, unknown> = {}) {
  return {
    document_id: randomUUID(),
    member_id: member,
    device_key_id: key,
    nonce: Buffer.alloc(24, 1).toString('base64'),
    ciphertext_sha256: 'a'.repeat(64),
    size_bytes: 1234,
    wrapped_key: Buffer.alloc(80, 2).toString('base64'),
    ...overrides,
  };
}

const path = (doc: { document_id: string; member_id: string }) =>
  `${seed.aurora}/${doc.member_id}/${doc.document_id}.bin`;

async function createBatch(s: Session, items: unknown[], title = 'Cedolino ottobre 2026') {
  return s.value<string>(`select public.create_payroll_batch($1, 'cedolino', '2026-10-01', $2, $3::jsonb)`, [
    seed.aurora,
    title,
    JSON.stringify(items),
  ]);
}

// Like a Storage API upload without upsert: INSERT only (RETURNING would need a SELECT policy).
async function upload(s: Session, objectPath: string, size = 1234) {
  await s.rows(
    `insert into storage.objects (bucket_id, name, metadata) values ('encrypted-documents', $1, jsonb_build_object('size', $2::int))`,
    [objectPath, size],
  );
}

describe('payroll batches', () => {
  it('drafts are only visible to HR', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      await createBatch(s, [item(members.marco, seed.keys.marco), item(members.anna, seed.keys.anna)]);
      expect(await s.value(`select count(*)::int from public.documents where status = 'draft'`)).toBe(2);
      await s.as(users.marco);
      expect(await s.rows(`select id from public.documents`)).toEqual([]);
      expect(await s.rows(`select document_id from public.document_key_wraps`)).toEqual([]);
      await s.as(users.francesca);
      expect(await s.rows(`select id from public.documents`)).toEqual([]);
    });
  });

  it('only encrypts for active keys of members of the same company', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const err = (items: unknown[]) =>
        s.error(`select public.create_payroll_batch($1, 'cedolino', '2026-10-01', 'x', $2::jsonb)`, [
          seed.aurora,
          JSON.stringify(items),
        ]);
      expect((await err([item(members.sara, seed.keys.sara)])).message).toContain('device_key_not_active');
      expect((await err([item(members.marco, seed.keys.anna)])).message).toContain('device_key_not_active');
      expect((await err([item(members.marco, seed.keys.marco, { nonce: 'AAAA' })])).code).toBe('23514');
      expect((await err([item(members.marco, seed.keys.marco, { wrapped_key: 'AAAA' })])).code).toBe('23514');
      expect((await err([])).code).toBe('22023');

      await s.rows(`select public.revoke_device_key($1)`, [seed.keys.marco]);
      expect((await err([item(members.marco, seed.keys.marco)])).message).toContain('device_key_not_active');

      await s.as(users.marco);
      expect((await err([item(members.marco, seed.keys.marco)])).message).toContain('forbidden');
    });
  });
});

describe('storage', () => {
  it('HR uploads exactly the announced draft objects; nobody lists or reads them', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const doc = item(members.marco, seed.keys.marco);
      await createBatch(s, [doc]);

      await s.as(users.marco);
      expect((await s.error(`insert into storage.objects (bucket_id, name) values ('encrypted-documents', $1)`, [path(doc)])).code).toBe('42501');
      await s.as(users.francesca);
      expect((await s.error(`insert into storage.objects (bucket_id, name) values ('encrypted-documents', $1)`, [path(doc)])).code).toBe('42501');

      await s.as(users.giulia);
      expect(
        (await s.error(`insert into storage.objects (bucket_id, name) values ('encrypted-documents', $1)`, [
          `${seed.aurora}/${members.marco}/${randomUUID()}.bin`,
        ])).code,
      ).toBe('42501');
      await upload(s, path(doc));
      expect(await s.rows(`select id from storage.objects`)).toEqual([]);
    });
  });
});

describe('publishing and reading', () => {
  it('publish checks every upload, then each employee sees only their document', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const marcoDoc = item(members.marco, seed.keys.marco);
      const annaDoc = item(members.anna, seed.keys.anna, { size_bytes: 999 });
      const batch = await createBatch(s, [marcoDoc, annaDoc]);

      expect((await s.error(`select public.publish_payroll_batch($1)`, [batch])).message).toContain('upload_incomplete');
      await upload(s, path(marcoDoc));
      await upload(s, path(annaDoc), 1000); // wrong size
      expect((await s.error(`select public.publish_payroll_batch($1)`, [batch])).message).toContain('upload_incomplete');

      await s.superuser();
      await s.rows(`update storage.objects set metadata = '{"size": 999}' where name = $1`, [path(annaDoc)]);
      await s.as(users.giulia);
      expect(await s.value(`select public.publish_payroll_batch($1)`, [batch])).toBe(2);
      expect((await s.error(`select public.publish_payroll_batch($1)`, [batch])).message).toContain('not_draft');

      await s.as(users.marco);
      expect(await s.rows(`select id from public.documents`)).toEqual([{ id: marcoDoc.document_id }]);
      expect(await s.rows(`select document_id from public.document_key_wraps`)).toEqual([
        { document_id: marcoDoc.document_id },
      ]);
      await s.as(users.luca); // managers do not see their team's payslips
      expect(await s.rows(`select id from public.documents`)).toEqual([]);
      await s.as(users.sara);
      expect(await s.rows(`select id from public.documents`)).toEqual([]);
    });
  });

  it('downloads and openings are logged for proof of delivery', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const doc = item(members.marco, seed.keys.marco);
      const batch = await createBatch(s, [doc]);
      await upload(s, path(doc));
      await s.rows(`select public.publish_payroll_batch($1)`, [batch]);

      await s.as(users.marco);
      expect((await s.error(`select public.svc_document_download($1, $2)`, [doc.document_id, users.marco])).code).toBe(
        '42501',
      );
      await s.service();
      const dl = await s.value<{ storage_path: string; wrapped_key: string; nonce: string }>(
        `select public.svc_document_download($1, $2)`,
        [doc.document_id, users.marco],
      );
      expect(dl).toMatchObject({ storage_path: path(doc), wrapped_key: doc.wrapped_key, nonce: doc.nonce });
      expect((await s.error(`select public.svc_document_download($1, $2)`, [doc.document_id, users.anna])).message).toContain(
        'not_found',
      );

      await s.as(users.anna);
      expect((await s.error(`select public.mark_document_opened($1)`, [doc.document_id])).message).toContain('not_found');
      await s.as(users.marco);
      await s.rows(`select public.mark_document_opened($1)`, [doc.document_id]);
      expect(await s.value(`select first_opened_at is not null from public.documents`)).toBe(true);

      await s.as(users.giulia);
      const events = await s.rows<{ event: string }>(
        `select event from public.document_access_events where document_id = $1 order by id`,
        [doc.document_id],
      );
      expect(events.map((e) => e.event)).toEqual(['published', 'downloaded', 'opened']);
      expect((await s.error(`delete from public.document_access_events`)).code).toBe('42501');
      await s.service();
      expect((await s.error(`delete from public.document_access_events`)).message).toContain('append-only');
    });
  });

  it('re-issuing after a phone change supersedes the old document', async () => {
    await inTx(db, async (s) => {
      await s.as(users.giulia);
      const old = item(members.marco, seed.keys.marco);
      const b1 = await createBatch(s, [old]);
      await upload(s, path(old));
      await s.rows(`select public.publish_payroll_batch($1)`, [b1]);

      await s.as(users.marco);
      const newKey = await s.value<string>(`select public.register_device_key($1, $2, $3)`, [
        seed.aurora,
        Buffer.alloc(32, 9).toString('base64'),
        Buffer.alloc(32, 8).toString('base64'),
      ]);

      await s.as(users.giulia);
      const reissued = item(members.marco, newKey, { supersedes_id: old.document_id });
      const b2 = await createBatch(s, [reissued], 'Cedolino ottobre 2026 (riemesso)');
      await upload(s, path(reissued));
      await s.rows(`select public.publish_payroll_batch($1)`, [b2]);

      await s.as(users.marco);
      const docs = await s.rows(`select id, status from public.documents order by created_at, status`);
      expect(docs).toEqual(
        expect.arrayContaining([
          { id: old.document_id, status: 'superseded' },
          { id: reissued.document_id, status: 'published' },
        ]),
      );
    });
  });
});
