// The payslip pipeline without the network: plan → cut → encrypt → (fake)
// upload/publish. Decryption uses the employee's device keys, exactly as the
// phone does, so a document HR publishes is proven to open for its recipient only.
import sodium from 'libsodium-wrappers';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptDocument, DocumentIntegrityError, generateDeviceKeys, keyFingerprint, type DeviceKeys, type Sodium } from '@fide/crypto';
import type { SplitResult } from '@fide/payroll-parser';
import {
  cutPdf,
  defaultPeriod,
  encryptForRecipient,
  knownEmployees,
  pageRanges,
  planRecipients,
  sendBatch,
  needsReview,
  allReviewPagesChecked,
  unassignedPages,
  willSend,
  type BatchBackend,
  type PreparedBatch,
} from './payroll';
import { todayInRome } from './memberStatus';
import type { Member } from './types';

const COMPANY = 'c0000000-0000-4000-8000-000000000001';
let s: Sodium;
beforeAll(async () => {
  await sodium.ready;
  s = sodium as unknown as Sodium;
});

function member(
  id: string,
  opts: { cf?: string; keys?: DeviceKeys; keyId?: string; status?: Member['status']; terminatedOn?: string; fakeFingerprint?: string } = {},
): Member {
  const k = opts.keys;
  return {
    id,
    company_id: COMPANY,
    auth_user_id: null,
    role: 'employee',
    status: opts.status ?? 'active',
    full_name: `Name ${id}`,
    site_id: null,
    manager_member_id: null,
    employee_number: null,
    preferred_language: 'it',
    terminated_on: opts.terminatedOn ?? null,
    status_changed_at: null,
    member_identities: { email: null, codice_fiscale: opts.cf ?? null },
    device_keys: k
      ? [
          {
            id: opts.keyId ?? `key-${id}`,
            status: 'active',
            fingerprint: opts.fakeFingerprint ?? keyFingerprint(k.x25519PublicKey, k.ed25519PublicKey),
            x25519_public_key: k.x25519PublicKey,
            ed25519_public_key: k.ed25519PublicKey,
            created_at: '2026-09-01T00:00:00Z',
          },
        ]
      : [],
  };
}

const split = (docs: Array<[string, number[], number[]?, number[]?]>, issues: SplitResult['issues'] = [], pageCount = 10): SplitResult => ({
  documents: docs.map(([memberId, pages, continuationPages = [], pagesWithoutName = []]) => ({
    memberId,
    codiceFiscale: 'X',
    pages,
    continuationPages,
    pagesWithoutName,
  })),
  issues,
  pageCount,
});

describe('planRecipients', () => {
  it('carries pages without the employee’s name and holds the send until HR reviews them', () => {
    const keys = { a: generateDeviceKeys(s), b: generateDeviceKeys(s) };
    const plan = planRecipients({
      split: split([
        ['a', [1, 2], [2], [2]],
        ['b', [3]],
      ]),
      members: [member('a', { cf: 'A', keys: keys.a }), member('b', { cf: 'B', keys: keys.b })],
      published: [],
      pinned: {},
      manual: {},
    });
    expect(plan.map((r) => [r.memberId, r.pagesWithoutName])).toEqual([
      ['a', [2]],
      ['b', []],
    ]);
    const review = needsReview(plan, new Set());
    expect(review.map((r) => r.memberId)).toEqual(['a']);
    expect(allReviewPagesChecked(review, {})).toBe(false);
    expect(allReviewPagesChecked(review, { 2: 'a' })).toBe(true);
    expect(allReviewPagesChecked(review, { 2: 'b' })).toBe(false);
  });

  it('requires individual review for pages manually assigned after an ambiguous parse', () => {
    const keys = generateDeviceKeys(s);
    const plan = planRecipients({
      split: split([], [{ page: 1, kind: 'unassigned' }], 1),
      members: [member('a', { cf: 'A', keys })],
      published: [],
      pinned: {},
      manual: { 1: 'a' },
    });
    expect(plan[0]).toMatchObject({ manualPages: [1], pagesRequiringReview: [1] });
    expect(needsReview(plan, new Set()).map((r) => r.memberId)).toEqual(['a']);
    expect(allReviewPagesChecked(needsReview(plan, new Set()), {})).toBe(false);
    expect(allReviewPagesChecked(needsReview(plan, new Set()), { 1: 'a' })).toBe(true);
  });

  it('still sends to a former employee during the 12-month window, not after', () => {
    const keys = { recent: generateDeviceKeys(s), old: generateDeviceKeys(s) };
    const plan = planRecipients({
      split: split([
        ['recent', [1]],
        ['old', [2]],
      ]),
      members: [
        member('recent', { keys: keys.recent, status: 'terminated', terminatedOn: todayInRome() }),
        member('old', { keys: keys.old, status: 'terminated', terminatedOn: '2020-01-31' }),
      ],
      published: [],
      pinned: {},
      manual: {},
    });
    expect(plan.map((r) => [r.memberId, r.state])).toEqual([
      ['recent', 'ready'],
      ['old', 'no_key'],
    ]);
  });

  it('derives each recipient state', () => {
    const keys = Object.fromEntries(['ready', 'delivered', 'reissue', 'changed', 'mismatch'].map((n) => [n, generateDeviceKeys(s)]));
    const members = [
      member('ready', { keys: keys.ready }),
      member('delivered', { keys: keys.delivered }),
      member('reissue', { keys: keys.reissue }),
      member('nokey', { status: 'invited' }),
      member('changed', { keys: keys.changed }),
      member('mismatch', { keys: keys.mismatch, fakeFingerprint: 'AAAA AAAA AAAA AAAA AAAA AAAA' }),
    ];
    const plan = planRecipients({
      split: split([
        ['ready', [1]],
        ['delivered', [2]],
        ['reissue', [3]],
        ['nokey', [4]],
        ['changed', [5]],
        ['mismatch', [6]],
        ['not-a-member', [7]],
      ]),
      members,
      published: [
        { id: 'doc-old', member_id: 'delivered', device_key_id: 'key-delivered', published_at: '2026-10-01T00:00:00Z' },
        { id: 'doc-r1', member_id: 'reissue', device_key_id: 'key-revoked', published_at: '2026-10-01T00:00:00Z' },
        { id: 'doc-r0', member_id: 'reissue', device_key_id: 'key-older', published_at: '2026-09-01T00:00:00Z' },
      ],
      pinned: { changed: { deviceKeyId: 'key-previous-phone', fingerprint: 'BBBB BBBB BBBB BBBB BBBB BBBB', pinnedAt: 't' } },
      manual: {},
    });
    expect(plan.map((r) => [r.memberId, r.state])).toEqual([
      ['ready', 'ready'],
      ['delivered', 'delivered'],
      ['reissue', 'reissue'],
      ['nokey', 'no_key'],
      ['changed', 'key_changed'],
      ['mismatch', 'key_mismatch'],
    ]);
    // The latest published document is the one replaced.
    expect(plan[2].existing?.id).toBe('doc-r1');
    expect(plan[0].trust?.kind).toBe('first_use');

    const resend = new Set(['delivered']);
    expect(plan.filter((r) => willSend(r, new Set())).map((r) => r.memberId)).toEqual(['ready', 'reissue']);
    expect(plan.filter((r) => willSend(r, resend)).map((r) => r.memberId)).toEqual(['ready', 'delivered', 'reissue']);
  });

  it('applies manual assignments to issue pages only', () => {
    const anna = member('anna', { keys: generateDeviceKeys(s) });
    const result = split(
      [['anna', [1, 2], [2]]],
      [
        { page: 3, kind: 'unassigned' },
        { page: 4, kind: 'ambiguous', codiciFiscali: ['A', 'B'] },
      ],
      4,
    );
    const plan = planRecipients({ split: result, members: [anna], published: [], pinned: {}, manual: { 3: 'anna', 1: 'anna', 4: 'ghost' } });
    expect(plan).toHaveLength(1);
    expect(plan[0].pages).toEqual([1, 2, 3]);
    expect(plan[0].manualPages).toEqual([3]);
    expect(plan[0].continuationPages).toEqual([2]);
    expect(unassignedPages(result, { 3: 'anna' })).toEqual([4]);
  });

  it('only matches employees that have a codice fiscale', () => {
    const list = knownEmployees([
      member('a', { cf: 'CLMMRC88M03D612C' }),
      member('b'),
      member('c', { cf: 'GLLNNA95S48A944C', status: 'erased' }),
    ]);
    expect(list).toEqual([{ memberId: 'a', codiceFiscale: 'CLMMRC88M03D612C', fullName: 'Name a' }]);
  });
});

it('formats page ranges and the default period', () => {
  expect(pageRanges([1, 2, 3, 5, 7, 8])).toBe('1–3, 5, 7–8');
  expect(pageRanges([4])).toBe('4');
  expect(defaultPeriod(new Date(2026, 0, 15))).toBe('2025-12');
  expect(defaultPeriod(new Date(2026, 9, 7))).toBe('2026-09');
});

async function bulkPdf(pages: string[]): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) doc.addPage([595, 842]).drawText(text, { x: 50, y: 780, size: 12, font });
  return PDFDocument.load(await doc.save());
}

describe('cut and encrypt', () => {
  it('produces documents only the recipient phone can open', async () => {
    const annaKeys = generateDeviceKeys(s);
    const marcoKeys = generateDeviceKeys(s);
    const members = [member('anna', { keys: annaKeys }), member('marco', { keys: marcoKeys })];
    const plan = planRecipients({
      split: split([
        ['anna', [1, 2]],
        ['marco', [3]],
      ]),
      members,
      published: [{ id: 'doc-prev', member_id: 'marco', device_key_id: 'key-old-phone', published_at: '2026-10-01T00:00:00Z' }],
      pinned: {},
      manual: {},
    });
    const source = await bulkPdf(['anna 1', 'anna 2', 'marco 1']);
    const docs = await Promise.all(
      plan.map(async (r, i) =>
        encryptForRecipient(s, {
          companyId: COMPANY,
          recipient: r,
          documentId: `d0000000-0000-4000-8000-00000000000${i}`,
          plaintext: await cutPdf(source, r.pages, 'Cedolino settembre 2026'),
          resend: new Set(),
        }),
      ),
    );

    const [anna, marco] = docs;
    expect(anna.storagePath).toBe(`${COMPANY}/anna/${anna.item.document_id}.bin`);
    expect(anna.item.size_bytes).toBe(anna.ciphertext.length);
    expect(anna.item.device_key_id).toBe('key-anna');
    expect(anna.item.supersedes_id).toBeUndefined();
    expect(marco.item.supersedes_id).toBe('doc-prev');

    const open = (d: typeof anna, keys: DeviceKeys, memberId = d.item.member_id) =>
      decryptDocument(s, {
        documentId: d.item.document_id,
        memberId,
        ciphertext: d.ciphertext,
        nonce: d.item.nonce,
        wrappedKey: d.item.wrapped_key,
        ciphertextSha256: d.item.ciphertext_sha256,
        keys,
      });
    const pdf = await PDFDocument.load(open(anna, annaKeys));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toBe('Cedolino settembre 2026');
    expect(() => open(anna, marcoKeys)).toThrow(DocumentIntegrityError);
    // Bound to its recipient: relabelling the document for someone else fails.
    expect(() => open(anna, annaKeys, 'marco')).toThrow(DocumentIntegrityError);
  });

  it('refuses recipients that must not receive documents', async () => {
    const plan = planRecipients({
      split: split([['nokey', [1]]]),
      members: [member('nokey', { status: 'invited' })],
      published: [],
      pinned: {},
      manual: {},
    });
    expect(() =>
      encryptForRecipient(s, { companyId: COMPANY, recipient: plan[0], documentId: 'x', plaintext: new Uint8Array(4), resend: new Set() }),
    ).toThrow(/cannot receive/);
  });
});

describe('sendBatch', () => {
  function batch(n: number): PreparedBatch {
    return {
      companyId: COMPANY,
      kind: 'cedolino',
      period: '2026-09-01',
      title: 'Cedolino',
      documents: Array.from({ length: n }, (_, i) => ({
        item: { document_id: `doc${i}` } as PreparedBatch['documents'][number]['item'],
        storagePath: `p/${i}`,
        ciphertext: new Uint8Array([i]),
      })),
      batchId: null,
      uploaded: new Set(),
    };
  }

  it('resumes after a failed upload without creating a second batch', async () => {
    const calls = { create: 0, publish: 0, uploads: [] as string[] };
    let failOnce = true;
    const backend: BatchBackend = {
      createBatch: async () => {
        calls.create++;
        return 'batch-1';
      },
      upload: async (path) => {
        if (path === 'p/2' && failOnce) {
          failOnce = false;
          throw new Error('network');
        }
        calls.uploads.push(path);
        return 'uploaded';
      },
      publish: async (id) => {
        calls.publish++;
        expect(id).toBe('batch-1');
        return 5;
      },
    };
    const b = batch(5);
    await expect(sendBatch(b, backend, undefined, 1)).rejects.toThrow('network');
    expect(b.batchId).toBe('batch-1');
    expect(calls.publish).toBe(0);
    expect([...b.uploaded].sort()).toEqual(['doc0', 'doc1']);

    const progress: string[] = [];
    await expect(sendBatch(b, backend, (p) => progress.push(`${p.phase}:${p.done}/${p.total}`), 2)).resolves.toBe(5);
    expect(calls.create).toBe(1);
    expect(calls.publish).toBe(1);
    expect(calls.uploads.sort()).toEqual(['p/0', 'p/1', 'p/2', 'p/3', 'p/4']);
    expect(progress[0]).toBe('uploading:2/5');
    expect(progress.at(-1)).toBe('publishing:5/5');
  });

  it('treats objects stored by an earlier attempt as uploaded', async () => {
    const b = batch(2);
    const backend: BatchBackend = {
      createBatch: async () => 'batch-2',
      upload: async () => 'exists',
      publish: async () => 2,
    };
    await expect(sendBatch(b, backend)).resolves.toBe(2);
    expect(b.uploaded.size).toBe(2);
  });
});

