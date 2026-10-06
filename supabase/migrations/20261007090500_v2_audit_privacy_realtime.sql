-- Fide v2 · 5/5 — Audit log, push tokens, GDPR requests, Realtime, final grants.

-- ---------------------------------------------------------------------------
-- Audit log: who changed what (column names only, never personal values)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid,
  actor_auth_user_id uuid,
  actor_db_role text not null,
  table_name text not null,
  row_id text,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  changed_columns text[],
  created_at timestamptz not null default now()
);

create index audit_log_company_created on public.audit_log (company_id, created_at desc);

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.forbid_mutation();

create function private.audit_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_row jsonb;
  v_changed text[];
begin
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) as k
    where v_new -> k is distinct from v_old -> k and k <> 'updated_at';
    if v_changed is null then
      return null;
    end if;
  end if;

  insert into public.audit_log (company_id, actor_auth_user_id, actor_db_role, table_name, row_id, operation, changed_columns)
  values (
    coalesce((v_row ->> 'company_id')::uuid,
             case when tg_table_name = 'companies' then (v_row ->> 'id')::uuid end),
    auth.uid(),
    coalesce(nullif(current_setting('role', true), 'none'), session_user),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'member_id'),
    tg_op,
    v_changed);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Push tokens (Expo). Notifications carry no personal content.
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expo_push_token text not null unique check (expo_push_token ~ '^Expo(nent)?PushToken\[[^\]]+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_tokens_user on public.push_tokens (auth_user_id);

-- ---------------------------------------------------------------------------
-- GDPR requests (art. 15-22). Erasure is executed by the gdpr-erasure function.
-- ---------------------------------------------------------------------------

create type public.gdpr_kind as enum ('access', 'portability', 'erasure', 'rectification', 'objection');
create type public.gdpr_status as enum ('pending', 'in_progress', 'completed', 'rejected');

create table public.gdpr_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  member_id uuid not null,
  kind public.gdpr_kind not null,
  details text check (details is null or char_length(details) <= 2000),
  status public.gdpr_status not null default 'pending',
  resolved_by uuid references public.members (id),
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, member_id) references public.members (company_id, id)
);

create index gdpr_requests_company_status on public.gdpr_requests (company_id, status);

create trigger gdpr_requests_updated_at before update on public.gdpr_requests
  for each row execute function private.set_updated_at();

create function public.resolve_gdpr_request(p_request_id uuid, p_status public.gdpr_status, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.gdpr_requests;
  me public.members;
begin
  select * into r from public.gdpr_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(r.company_id, '{hr_admin,company_owner}');
  if p_status = 'pending' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.gdpr_requests
  set status = p_status, resolution_note = nullif(trim(p_note), ''),
      resolved_by = case when p_status in ('completed', 'rejected') then me.id end,
      resolved_at = case when p_status in ('completed', 'rejected') then now() end
  where id = r.id;
end;
$$;

-- Art. 15/20: everything Fide holds about the caller, as JSON. Runs with the
-- caller's rights (RLS applies) and only covers the caller's own memberships.
create function public.export_my_data()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with mine as (select private.my_member_ids() as id)
  select jsonb_build_object(
    'format', 'fide-export-v1',
    'generated_at', now(),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.members m where m.id in (select id from mine)),
    'identities', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from public.member_identities i where i.member_id in (select id from mine)),
    'companies', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'legal_name', c.legal_name, 'vat_number', c.vat_number, 'pec', c.pec)), '[]')
                  from public.companies c where c.id in (select company_id from public.members where id in (select id from mine))),
    'device_keys', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from public.device_keys k where k.member_id in (select id from mine)),
    'key_events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.key_events e where e.member_id in (select id from mine)),
    'punches', (select coalesce(jsonb_agg(to_jsonb(p) order by p.device_ts), '[]') from public.punches p where p.member_id in (select id from mine)),
    'punch_corrections', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.punch_corrections c where c.member_id in (select id from mine)),
    'leave_requests', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.leave_requests r where r.member_id in (select id from mine)),
    'leave_balances', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.leave_balances b where b.member_id in (select id from mine)),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', d.id, 'kind', d.kind, 'title', d.title, 'period', d.period, 'status', d.status,
                    'published_at', d.published_at, 'first_opened_at', d.first_opened_at)), '[]')
                  from public.documents d where d.member_id in (select id from mine)),
    'document_access_events', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.document_access_events a where a.member_id in (select id from mine)),
    'gdpr_requests', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from public.gdpr_requests g where g.member_id in (select id from mine))
  );
$$;

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'sites', 'members', 'member_identities', 'invitations', 'kiosk_devices',
    'device_keys', 'punch_corrections', 'payroll_batches', 'documents', 'leave_types',
    'leave_balances', 'leave_requests', 'gdpr_requests'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()',
      t || '_audit', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.audit_log enable row level security;
alter table public.push_tokens enable row level security;
alter table public.gdpr_requests enable row level security;

create policy audit_log_select on public.audit_log for select to authenticated
  using (company_id in (select private.my_hr_company_ids()));

create policy push_tokens_own on public.push_tokens for all to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

create policy gdpr_requests_select on public.gdpr_requests for select to authenticated
  using (
    member_id in (select private.my_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );
create policy gdpr_requests_insert on public.gdpr_requests for insert to authenticated
  with check (
    member_id in (select private.my_member_ids())
    and company_id in (select private.my_company_ids())
  );

revoke all on public.audit_log, public.push_tokens, public.gdpr_requests from anon, authenticated;
grant select on public.audit_log to authenticated;
grant select, delete on public.push_tokens to authenticated;
grant insert (expo_push_token, platform) on public.push_tokens to authenticated;
grant update (last_seen_at) on public.push_tokens to authenticated;
grant select on public.gdpr_requests to authenticated;
grant insert (company_id, member_id, kind, details) on public.gdpr_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: postgres_changes applies RLS per subscriber.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.punches, public.punch_corrections, public.documents, public.leave_requests;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Final sweep. Nothing is reachable by anon; functions are opt-in.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Pure validators (used in CHECK constraints).
grant execute on function
  public.is_valid_codice_fiscale(text),
  public.is_valid_partita_iva(text),
  public.b64_len(text),
  public.key_fingerprint(text, text)
  to authenticated, service_role;

-- RLS helpers referenced by policies.
grant execute on function
  private.my_member_ids(),
  private.my_company_ids(),
  private.my_hr_company_ids(),
  private.my_managed_member_ids()
  to authenticated, service_role;

-- Client RPCs (each one authorises the caller itself).
grant execute on function
  public.register_company(text, text, text, text, text, text, text, text, text),
  public.add_member(uuid, text, text, text, uuid, uuid, text, public.member_role, text),
  public.set_member_role(uuid, public.member_role),
  public.set_member_status(uuid, public.member_status),
  public.set_my_language(text),
  public.create_invitation(uuid),
  public.revoke_invitation(uuid),
  public.redeem_invitation(text),
  public.create_kiosk(uuid, text),
  public.revoke_kiosk(uuid),
  public.register_device_key(uuid, text, text, text),
  public.revoke_device_key(uuid, text),
  public.decide_punch_correction(uuid, boolean, text),
  public.cancel_punch_correction(uuid),
  public.create_payroll_batch(uuid, public.document_kind, date, text, jsonb),
  public.publish_payroll_batch(uuid),
  public.mark_document_opened(uuid),
  public.decide_leave_request(uuid, boolean, text),
  public.cancel_leave_request(uuid),
  public.resolve_gdpr_request(uuid, public.gdpr_status, text),
  public.export_my_data()
  to authenticated;

-- Edge Functions only.
grant execute on function
  public.svc_pair_kiosk(text),
  public.svc_get_kiosk(uuid),
  public.svc_record_punch(jsonb),
  public.svc_get_device_key(uuid),
  public.svc_document_download(uuid, uuid)
  to service_role;

-- Functions created later must be granted explicitly too.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
