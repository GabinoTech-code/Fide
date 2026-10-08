// Payslip distribution, entirely in HR's browser:
//   bulk PDF → page texts (pdf.js, lib/pdfText.ts) → splitPayroll → one PDF per
//   employee (pdf-lib) → fide-doc-v1 encryption to the employee's device key →
//   create_payroll_batch → Storage upload (ciphertext only) → publish_payroll_batch.
// Nothing here talks to Supabase directly, so the whole flow is unit-tested.
import { encryptDocument, type Sodium } from '@fide/crypto';
import type { KnownEmployee, SplitResult } from '@fide/payroll-parser';
import { PDFDocument } from 'pdf-lib';
import { evaluateTrust, type TrustState, type PinnedDevices } from './deviceTrust';
import { hasDocumentAccess } from './memberStatus';
import type { Member } from './types';

export type DocumentKind = 'cedolino' | 'cu' | 'other';

/** Latest published document of the same kind and period, per member. */
export interface PublishedDoc {
  id: string;
  member_id: string;
  device_key_id: string;
  published_at: string | null;
}

export type RecipientState =
  /** Nothing published yet for this period. */
  | 'ready'
  /** Published to a key that is no longer active (new phone): replace it. */
  | 'reissue'
  /** Already published to the current key: skipped unless HR resends it. */
  | 'delivered'
  /** No active device yet: cannot receive encrypted documents. */
  | 'no_key'
  /** The key differs from the one this browser trusted: verify first. */
  | 'key_changed'
  /** Server-supplied fingerprint inconsistent with the keys: never send. */
  | 'key_mismatch';

export interface Recipient {
  memberId: string;
  fullName: string;
  codiceFiscale: string | null;
  /** 1-based, ascending. */
  pages: number[];
  continuationPages: number[];
  manualPages: number[];
  key: { id: string; x25519PublicKey: string } | null;
  trust: TrustState | null;
  existing: PublishedDoc | null;
  state: RecipientState;
}

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

export function knownEmployees(members: Member[]): KnownEmployee[] {
  return members.flatMap((m) => {
    const cf = one(m.member_identities)?.codice_fiscale;
    return cf && m.status !== 'erased' ? [{ memberId: m.id, codiceFiscale: cf }] : [];
  });
}

/** Members that can be picked by hand for a page the parser could not assign. */
export function assignableMembers(members: Member[]): Member[] {
  return members.filter((m) => hasDocumentAccess(m) && m.device_keys?.some((k) => k.status === 'active'));
}

export function planRecipients(input: {
  split: SplitResult;
  members: Member[];
  published: PublishedDoc[];
  pinned: PinnedDevices;
  /** page → member id, for pages listed in split.issues only. */
  manual: Record<number, string>;
}): Recipient[] {
  const members = new Map(input.members.map((m) => [m.id, m]));
  const latest = new Map<string, PublishedDoc>();
  for (const doc of input.published) {
    const seen = latest.get(doc.member_id);
    if (!seen || (doc.published_at ?? '') > (seen.published_at ?? '')) latest.set(doc.member_id, doc);
  }

  const groups = new Map<string, { pages: Set<number>; continuation: number[]; manual: number[] }>();
  const group = (memberId: string) => {
    let g = groups.get(memberId);
    if (!g) groups.set(memberId, (g = { pages: new Set(), continuation: [], manual: [] }));
    return g;
  };
  for (const doc of input.split.documents) {
    if (!members.has(doc.memberId)) continue;
    const g = group(doc.memberId);
    doc.pages.forEach((p) => g.pages.add(p));
    g.continuation.push(...doc.continuationPages);
  }
  const issuePages = new Set(input.split.issues.map((i) => i.page));
  for (const [pageKey, memberId] of Object.entries(input.manual)) {
    const page = Number(pageKey);
    if (!issuePages.has(page) || !members.has(memberId)) continue;
    const g = group(memberId);
    g.pages.add(page);
    g.manual.push(page);
  }

  const recipients: Recipient[] = [];
  for (const [memberId, g] of groups) {
    const m = members.get(memberId)!;
    // Former employees still receive documents (final payslip, CU) during their access window.
    const active = hasDocumentAccess(m) ? (m.device_keys ?? []).find((k) => k.status === 'active') : undefined;
    const existing = latest.get(memberId) ?? null;
    const trust = active ? evaluateTrust(active, input.pinned[memberId]) : null;

    let state: RecipientState;
    if (!active) state = 'no_key';
    else if (trust!.kind === 'mismatch') state = 'key_mismatch';
    else if (trust!.kind === 'changed') state = 'key_changed';
    else if (existing) state = existing.device_key_id === active.id ? 'delivered' : 'reissue';
    else state = 'ready';

    recipients.push({
      memberId,
      fullName: m.full_name,
      codiceFiscale: one(m.member_identities)?.codice_fiscale ?? null,
      pages: [...g.pages].sort((a, b) => a - b),
      continuationPages: g.continuation.sort((a, b) => a - b),
      manualPages: g.manual.sort((a, b) => a - b),
      key: active ? { id: active.id, x25519PublicKey: active.x25519_public_key } : null,
      trust,
      existing,
      state,
    });
  }
  return recipients.sort((a, b) => a.pages[0] - b.pages[0]);
}

export function willSend(r: Recipient, resend: ReadonlySet<string>): boolean {
  return r.state === 'ready' || r.state === 'reissue' || (r.state === 'delivered' && resend.has(r.memberId));
}

/** Issue pages nobody was assigned to: they are not sent. */
export function unassignedPages(split: SplitResult, manual: Record<number, string>): number[] {
  return split.issues.map((i) => i.page).filter((p) => !manual[p]);
}

/** "1–3, 5" */
export function pageRanges(pages: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(j > i ? `${pages[i]}–${pages[j]}` : String(pages[i]));
    i = j;
  }
  return out.join(', ');
}

export async function cutPdf(source: PDFDocument, pages: number[], title: string): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    source,
    pages.map((p) => p - 1),
  );
  copied.forEach((p) => out.addPage(p));
  out.setTitle(title);
  out.setCreator('Fide');
  out.setProducer('Fide');
  return out.save();
}

export interface BatchItem {
  document_id: string;
  member_id: string;
  device_key_id: string;
  nonce: string;
  ciphertext_sha256: string;
  size_bytes: number;
  wrapped_key: string;
  supersedes_id?: string;
}

export interface PreparedDocument {
  item: BatchItem;
  storagePath: string;
  ciphertext: Uint8Array;
}

export function storagePath(companyId: string, memberId: string, documentId: string): string {
  return `${companyId}/${memberId}/${documentId}.bin`;
}

export function encryptForRecipient(
  sodium: Sodium,
  input: { companyId: string; recipient: Recipient; documentId: string; plaintext: Uint8Array; resend: ReadonlySet<string> },
): PreparedDocument {
  const { recipient: r } = input;
  if (!r.key || !willSend(r, input.resend)) throw new Error(`recipient ${r.memberId} cannot receive documents`);
  const encrypted = encryptDocument(sodium, {
    documentId: input.documentId,
    memberId: r.memberId,
    plaintext: input.plaintext,
    recipientX25519PublicKey: r.key.x25519PublicKey,
  });
  const supersedes = r.state === 'reissue' || r.state === 'delivered' ? r.existing?.id : undefined;
  return {
    item: {
      document_id: input.documentId,
      member_id: r.memberId,
      device_key_id: r.key.id,
      nonce: encrypted.nonce,
      ciphertext_sha256: encrypted.ciphertextSha256,
      size_bytes: encrypted.sizeBytes,
      wrapped_key: encrypted.wrappedKey,
      ...(supersedes ? { supersedes_id: supersedes } : {}),
    },
    storagePath: storagePath(input.companyId, r.memberId, input.documentId),
    ciphertext: encrypted.ciphertext,
  };
}

/** Survives a failed attempt, so "retry" resumes where it stopped. */
export interface PreparedBatch {
  companyId: string;
  kind: DocumentKind;
  /** YYYY-MM-01 */
  period: string;
  title: string;
  documents: PreparedDocument[];
  batchId: string | null;
  uploaded: Set<string>;
}

export interface BatchBackend {
  createBatch(batch: PreparedBatch): Promise<string>;
  /** 'exists' when a previous attempt already stored this object. */
  upload(path: string, ciphertext: Uint8Array): Promise<'uploaded' | 'exists'>;
  publish(batchId: string): Promise<number>;
}

export type SendProgress = { phase: 'uploading' | 'publishing'; done: number; total: number };

export async function sendBatch(
  batch: PreparedBatch,
  backend: BatchBackend,
  onProgress: (p: SendProgress) => void = () => undefined,
  concurrency = 4,
): Promise<number> {
  batch.batchId ??= await backend.createBatch(batch);

  const total = batch.documents.length;
  const queue = batch.documents.filter((d) => !batch.uploaded.has(d.item.document_id));
  onProgress({ phase: 'uploading', done: total - queue.length, total });
  let failure: unknown = null;
  const worker = async () => {
    for (let doc = queue.shift(); doc && !failure; doc = queue.shift()) {
      try {
        await backend.upload(doc.storagePath, doc.ciphertext);
        batch.uploaded.add(doc.item.document_id);
        onProgress({ phase: 'uploading', done: batch.uploaded.size, total });
      } catch (err) {
        failure ??= err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
  if (failure) throw failure;

  onProgress({ phase: 'publishing', done: total, total });
  return backend.publish(batch.batchId);
}

/** First day of the previous month: payslips are distributed after the month closes. */
export function defaultPeriod(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
