import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => db?.close());

describe('anon (the publishable key) reaches nothing', () => {
  it('has no table, column or function privileges in public/private', async () => {
    await inTx(db, async (s) => {
      expect(
        await s.rows(`select table_schema, table_name, privilege_type from information_schema.role_table_grants
                      where grantee = 'anon' and table_schema in ('public', 'private')`),
      ).toEqual([]);
      expect(
        await s.rows(`select table_name, column_name from information_schema.role_column_grants
                      where grantee = 'anon' and table_schema in ('public', 'private')`),
      ).toEqual([]);
      expect(
        await s.rows(`select p.oid::regprocedure::text as fn
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')`),
      ).toEqual([]);
    });
  });

  it('gets permission denied on every table and view', async () => {
    await inTx(db, async (s) => {
      const relations = await s.rows<{ name: string }>(
        `select table_name as name from information_schema.tables where table_schema = 'public'`,
      );
      expect(relations.length).toBeGreaterThan(15);
      await s.anon();
      for (const { name } of relations) {
        const err = await s.error(`select 1 from public.${name} limit 1`);
        expect(err.code, name).toBe('42501');
      }
    });
  });

  it('cannot call RPCs', async () => {
    await inTx(db, async (s) => {
      await s.anon();
      const err = await s.error(`select public.register_company('X S.r.l.', '01234567897', 'X')`);
      expect(err.code).toBe('42501');
    });
  });
});

describe('authenticated', () => {
  it('can execute exactly the reviewed function list', async () => {
    await inTx(db, async (s) => {
      const fns = await s.rows<{ fn: string }>(
        `select p.oid::regprocedure::text as fn
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'execute')
         order by 1`,
      );
      expect(fns.map((r) => r.fn)).toEqual(
        [
          'add_member(uuid,text,text,text,uuid,uuid,text,member_role,text)',
          'b64_len(text)',
          'cancel_leave_request(uuid)',
          'cancel_punch_correction(uuid)',
          'create_invitation(uuid)',
          'create_kiosk(uuid,text)',
          'create_payroll_batch(uuid,document_kind,date,text,jsonb)',
          'decide_leave_request(uuid,boolean,text)',
          'decide_punch_correction(uuid,boolean,text)',
          'export_my_data()',
          'is_valid_codice_fiscale(text)',
          'is_valid_partita_iva(text)',
          'key_fingerprint(text,text)',
          'mark_document_opened(uuid)',
          'private.my_company_ids()',
          'private.my_hr_company_ids()',
          'private.my_managed_member_ids()',
          'private.my_member_ids()',
          'publish_payroll_batch(uuid)',
          'redeem_invitation(text)',
          'register_company(text,text,text,text,text,text,text,text,text)',
          'register_device_key(uuid,text,text,text)',
          'resolve_gdpr_request(uuid,gdpr_status,text)',
          'revoke_device_key(uuid,text)',
          'revoke_invitation(uuid)',
          'revoke_kiosk(uuid)',
          'set_member_role(uuid,member_role)',
          'set_member_status(uuid,member_status)',
          'set_my_language(text)',
        ].sort(),
      );
    });
  });

  it('cannot call svc_* functions or read private tables', async () => {
    await inTx(db, async (s) => {
      await s.as(seed.users.giulia);
      for (const sql of [
        `select public.svc_pair_kiosk('ABCDEFGH')`,
        `select public.svc_get_kiosk('${seed.kiosk}')`,
        `select public.svc_record_punch('{}'::jsonb)`,
        `select public.svc_get_device_key('${seed.keys.marco}')`,
        `select public.svc_document_download('${seed.keys.marco}', '${seed.users.marco}')`,
        `select * from private.kiosk_secrets`,
        `select * from private.signup_allowlist`,
        `select * from private.app_settings`,
      ]) {
        expect((await s.error(sql)).code, sql).toBe('42501');
      }
    });
  });

  it('cannot read invitation token hashes', async () => {
    await inTx(db, async (s) => {
      await s.as(seed.users.giulia);
      expect((await s.error(`select token_hash from public.invitations`)).code).toBe('42501');
    });
  });
});
