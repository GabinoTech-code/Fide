// The database and the clients must agree byte for byte on derived values.
import sodium from 'libsodium-wrappers';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { generateDeviceKeys, keyFingerprint } from '@fide/crypto';
import { codiceFiscaleCheckChar, isValidCodiceFiscale, isValidPartitaIva, partitaIvaCheckDigit } from '@fide/shared';
import { createDb, inTx } from './harness';

let db: PGlite;
beforeAll(async () => {
  await sodium.ready;
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

it('key fingerprints match public.key_fingerprint()', async () => {
  await inTx(db, async (s) => {
    for (let i = 0; i < 20; i++) {
      const k = generateDeviceKeys(sodium);
      const sql = await s.value(`select public.key_fingerprint($1, $2)`, [k.x25519PublicKey, k.ed25519PublicKey]);
      expect(sql).toBe(keyFingerprint(k.x25519PublicKey, k.ed25519PublicKey));
    }
  });
});

it('codice fiscale and partita IVA validators agree', async () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pick = (alphabet: string, n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  const omo = '0123456789LMNPQRSTUV';
  const cfs: string[] = [];
  for (let i = 0; i < 300; i++) {
    const body = pick(letters, 6) + pick(omo, 2) + pick('ABCDEHLMPRST', 1) + pick(omo, 2) + pick(letters, 1) + pick(omo, 3);
    const check = codiceFiscaleCheckChar(body);
    cfs.push(body + check, body + (check === 'Z' ? 'A' : String.fromCharCode(check.charCodeAt(0) + 1)));
  }
  cfs.push('', 'rssmra85t10a562s', 'RSSMRA85T10A562', 'RSSMRA85T10A562SX', '12345678901');

  const pivas: string[] = [];
  for (let i = 0; i < 300; i++) {
    const body = pick('0123456789', 10);
    const d = partitaIvaCheckDigit(body);
    pivas.push(body + d, body + ((d + 1) % 10));
  }
  pivas.push('', '00000000000', '1234567890', 'IT01234567897');

  await inTx(db, async (s) => {
    const sqlCf = await s.rows<{ v: string; ok: boolean }>(
      `select v, public.is_valid_codice_fiscale(v) as ok from unnest($1::text[]) as v`,
      [cfs],
    );
    // SQL expects normalised (uppercase, no spaces) values; the TS validator normalises first.
    for (const { v, ok } of sqlCf) expect(ok, v).toBe(v === v.toUpperCase() && isValidCodiceFiscale(v));

    const sqlPiva = await s.rows<{ v: string; ok: boolean }>(
      `select v, public.is_valid_partita_iva(v) as ok from unnest($1::text[]) as v`,
      [pivas],
    );
    for (const { v, ok } of sqlPiva) expect(ok, v).toBe(isValidPartitaIva(v));
  });
});
