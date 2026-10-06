// POST /functions/v1/document-url   { document_id }   (employee JWT)
// Logs the download (proof of delivery) and returns a 60-second signed URL to
// the ciphertext plus what the app needs to decrypt it on the device.
import { handler, HttpError, requireUser, requireUuid, rpc, serviceClient } from '../_shared/http.ts';

const BUCKET = 'encrypted-documents';

interface Download {
  document_id: string;
  member_id: string;
  storage_path: string;
  format: string;
  nonce: string;
  wrapped_key: string | null;
  device_key_id: string;
  ciphertext_sha256: string;
  size_bytes: number;
}

Deno.serve(
  handler(async (req, body) => {
    const user = await requireUser(req);
    const documentId = requireUuid(body.document_id, 'document_id');
    const svc = serviceClient();
    const doc = await rpc<Download>(
      svc,
      'svc_document_download',
      { p_document_id: documentId, p_auth_user_id: user.id },
      { not_found: 404 },
    );
    if (!doc.wrapped_key) throw new HttpError(409, 'not_encrypted_for_device');
    const { data, error } = await svc.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
    if (error || !data) throw new Error(`signed url: ${error?.message}`);
    return { ...doc, url: data.signedUrl, expires_in: 60 };
  }),
);
