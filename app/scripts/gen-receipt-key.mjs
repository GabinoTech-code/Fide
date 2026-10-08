#!/usr/bin/env node
// Generates the Ed25519 key punch-sync uses to sign server receipts.
//   node scripts/gen-receipt-key.mjs
// Store the private key as an Edge Function secret:
//   supabase secrets set FIDE_RECEIPT_PRIVATE_KEY=<private>
// Publish the public key (docs, portal) so anyone can verify a receipt:
//   Ed25519 over "FIDE-RECEIPT-v1|<punch_id>|<sha256(signed_payload)>|<received_at>"
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const b64 = (buf) => Buffer.from(buf).toString('base64');
console.log(`FIDE_RECEIPT_PRIVATE_KEY=${b64(await crypto.subtle.exportKey('pkcs8', privateKey))}`);
console.log(`FIDE_RECEIPT_PUBLIC_KEY=${b64(await crypto.subtle.exportKey('raw', publicKey))}`);
