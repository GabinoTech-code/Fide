// Payslips and other documents: listed from the database (RLS shows only the
// employee's published documents), downloaded through document-url (which logs
// the download), decrypted on the phone and handed to the system PDF viewer.
import { Directory, File, Paths } from 'expo-file-system';
import { decryptDocument, DocumentIntegrityError } from '@fide/crypto';
import { getSodium } from './sodium';
import { callFunction, supabase } from './supabase';
import type { StoredKeys } from './vault';

export interface DocumentRow {
  id: string;
  kind: 'cedolino' | 'cu' | 'other';
  title: string;
  period: string | null;
  status: 'published' | 'superseded';
  published_at: string;
  first_opened_at: string | null;
  device_key_id: string;
}

interface Download {
  member_id: string;
  nonce: string;
  wrapped_key: string;
  device_key_id: string;
  ciphertext_sha256: string;
  url: string;
}

export type DocumentErrorCode = 'not_for_device' | 'integrity' | 'needs_update';

export class DocumentError extends Error {
  constructor(readonly code: DocumentErrorCode) {
    super(code);
  }
}

export async function listDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, kind, title, period, status, published_at, first_opened_at, device_key_id')
    .order('published_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

const PREFIX = 'fide-doc-';

/** Removes decrypted copies left in the cache by earlier openings. */
export function cleanupDecrypted(): void {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && entry.name.startsWith(PREFIX)) entry.delete();
    }
  } catch {
    // Nothing to clean or the cache is unavailable.
  }
}

/** Decrypts and opens a document. The caller must have unlocked the vault first. */
export async function openDocument(doc: DocumentRow, keys: StoredKeys, dialogTitle: string): Promise<void> {
  if (doc.device_key_id !== keys.deviceKeyId) throw new DocumentError('not_for_device');

  let Sharing: typeof import('expo-sharing');
  try {
    Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) throw new Error('unavailable');
  } catch {
    // The installed build predates expo-sharing.
    throw new DocumentError('needs_update');
  }

  const meta = await callFunction<Download>('document-url', { document_id: doc.id });
  if (meta.device_key_id !== keys.deviceKeyId) throw new DocumentError('not_for_device');
  const res = await fetch(meta.url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const ciphertext = new Uint8Array(await res.arrayBuffer());

  const sodium = await getSodium();
  let plain: Uint8Array;
  try {
    plain = decryptDocument(sodium, {
      documentId: doc.id,
      memberId: meta.member_id,
      ciphertext,
      nonce: meta.nonce,
      wrappedKey: meta.wrapped_key,
      ciphertextSha256: meta.ciphertext_sha256,
      keys,
    });
  } catch (err) {
    if (err instanceof DocumentIntegrityError) throw new DocumentError('integrity');
    throw err;
  }

  cleanupDecrypted();
  const file = new File(Paths.cache, `${PREFIX}${doc.id}.pdf`);
  file.create();
  file.write(plain);
  plain.fill(0);

  await supabase.rpc('mark_document_opened', { p_document_id: doc.id });
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
}
