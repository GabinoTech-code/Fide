// Payslips and other documents: listed from the database (RLS shows only the
// employee's published documents), downloaded through document-url (which logs
// the download), decrypted on the phone, then opened in the system viewer or
// saved where the employee chooses.
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { decryptDocument, DocumentIntegrityError } from '@fide/crypto';
import { getSodium } from './sodium';
import { callFunction, supabase } from './supabase';
import { pdfName } from './fileName';
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

async function loadSharing(): Promise<typeof import('expo-sharing')> {
  try {
    const Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) throw new Error('unavailable');
    return Sharing;
  } catch {
    // The installed build predates expo-sharing.
    throw new DocumentError('needs_update');
  }
}

/** Downloads, verifies and decrypts a document. The caller zeroes the result. */
async function decrypt(doc: DocumentRow, keys: StoredKeys): Promise<Uint8Array> {
  if (doc.device_key_id !== keys.deviceKeyId) throw new DocumentError('not_for_device');
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
  await supabase.rpc('mark_document_opened', { p_document_id: doc.id });
  return plain;
}

/** Writes the PDF to the app cache, wiped at the next app start. */
async function toCache(doc: DocumentRow, keys: StoredKeys): Promise<File> {
  const plain = await decrypt(doc, keys);
  try {
    cleanupDecrypted();
    const file = new File(Paths.cache, `${PREFIX}${doc.id}.pdf`);
    file.create();
    file.write(plain);
    return file;
  } finally {
    plain.fill(0);
  }
}

/** Decrypts and opens a document. The caller must have unlocked the vault first. */
export async function openDocument(doc: DocumentRow, keys: StoredKeys, dialogTitle: string): Promise<void> {
  const Sharing = await loadSharing();
  const file = await toCache(doc, keys);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
}

/**
 * Saves a decrypted copy where the employee chooses. Android: a folder picked
 * through the system picker (e.g. Download). iOS: the share sheet, whose
 * "Save to Files" is the system way. Returns false if the employee cancelled.
 * The copy outside Fide is the employee's own: Fide no longer protects it.
 */
export async function saveDocument(doc: DocumentRow, keys: StoredKeys, dialogTitle: string): Promise<boolean> {
  if (Platform.OS !== 'android') {
    await openDocument(doc, keys, dialogTitle);
    return true;
  }
  // Pick the folder first: nothing is decrypted while the picker is open.
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return false;
  }
  if (doc.device_key_id !== keys.deviceKeyId) throw new DocumentError('not_for_device');
  const plain = await decrypt(doc, keys);
  try {
    let target: File;
    try {
      target = folder.createFile(pdfName(doc.title), 'application/pdf');
    } catch {
      // Same name already there: keep both.
      target = folder.createFile(pdfName(`${doc.title} ${Date.now()}`), 'application/pdf');
    }
    target.write(plain);
    return true;
  } finally {
    plain.fill(0);
  }
}
