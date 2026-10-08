// The hosted project already runs the v1 schema (open RLS, demo data). `supabase
// db push` applies the v2 migrations on top of it, so that is what this tests:
// v1 objects are gone, v2 is complete, and the platform's own extensions survive.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb } from './harness';

const v1 = { name: 'v1-schema.sql', sql: readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'v1-schema.sql'), 'utf8') };
const V1_TABLES = ['employee_invitations', 'encrypted_documents', 'attendance_punches', 'user_public_keys', 'users', 'company_sites', 'companies'];

let db: PGlite | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

const tables = async (d: PGlite) =>
  (await d.query<{ t: string }>(`select tablename as t from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.t);
const uuidOsspSchema = async (d: PGlite) =>
  (
    await d.query<{ s: string }>(
      `select n.nspname as s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'uuid-ossp'`,
    )
  ).rows[0]?.s ?? null;

describe('v2 over the hosted v1 schema', () => {
  it('drops every v1 table and creates the v2 schema', async () => {
    db = await createDb({ before: [v1], seed: false });
    const now = await tables(db);
    for (const t of V1_TABLES.filter((t) => t !== 'companies')) expect(now).not.toContain(t);
    // `companies` exists again, but it is v2's table.
    const columns = (await db.query<{ c: string }>(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'companies'`)).rows.map((r) => r.c);
    expect(columns).toContain('vat_number');
    expect(columns).not.toContain('public_key_fingerprint');
    expect(now).toEqual(expect.arrayContaining(['members', 'member_identities', 'device_keys', 'punches', 'documents', 'leave_requests', 'audit_log']));
    // No policy of v1 survives.
    const policies = (await db.query<{ p: string }>(`select policyname as p from pg_policies where schemaname = 'public'`)).rows.map((r) => r.p);
    expect(policies.some((p) => /^(Allow|Strict)/.test(p))).toBe(false);
  });

  it('removes a uuid-ossp that v1 put in public', async () => {
    db = await createDb({ before: [v1], seed: false });
    expect(await uuidOsspSchema(db)).toBeNull();
  });

  it('keeps the uuid-ossp Supabase installs in the extensions schema', async () => {
    const platform = { name: 'platform-extensions.sql', sql: `create schema if not exists extensions; create extension if not exists "uuid-ossp" with schema extensions;` };
    db = await createDb({ before: [platform, v1], seed: false });
    expect(await uuidOsspSchema(db)).toBe('extensions');
    expect((await db.query<{ ok: boolean }>(`select extensions.uuid_generate_v4() is not null as ok`)).rows[0].ok).toBe(true);
  });
});
