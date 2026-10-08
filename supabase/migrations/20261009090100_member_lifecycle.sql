-- Block 1 · E1–E3 — employee lifecycle: suspend, terminate, edit.
--
-- suspended   reversible block: no access at all.
-- terminated  employment ended on `terminated_on`. The person can no longer
--             punch or file requests, but for 12 months keeps read access to
--             their own documents, history and privacy rights, so the final
--             payslip, TFR and next year's CU (due 16 March) reach them in Fide.
--             After that the access closes by itself (no job needed: the window
--             is part of the RLS helper).
--
-- Punches signed offline before the status change are still accepted when they
-- sync later (status_changed_at), like punches signed before a key revocation.

alter table public.members
  add column status_changed_at timestamptz,
  add column terminated_on date,
  add constraint members_terminated_on check ((status = 'terminated') = (terminated_on is not null));

-- ---------------------------------------------------------------------------
-- Who can still read their own data
-- ---------------------------------------------------------------------------

-- Read access for a membership: active, or terminated less than 12 months ago.
create function private.has_own_access(p_status public.member_status, p_terminated_on date)
returns boolean
language sql stable
set search_path = ''
as $$
  select p_status = 'active'
      or (p_status = 'terminated' and p_terminated_on > (current_date - interval '12 months')::date);
$$;

-- Memberships of the caller that may READ their own data. Writes keep using
-- private.my_member_ids() (active only).
create function private.my_readable_member_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.id from public.members m
  where m.auth_user_id = (select auth.uid()) and private.has_own_access(m.status, m.terminated_on);
$$;

create function private.my_readable_company_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.company_id from public.members m
  where m.auth_user_id = (select auth.uid()) and private.has_own_access(m.status, m.terminated_on);
$$;

revoke execute on function private.has_own_access(public.member_status, date) from public, anon;
revoke execute on function private.my_readable_member_ids() from public, anon;
revoke execute on function private.my_readable_company_ids() from public, anon;
grant execute on function private.has_own_access(public.member_status, date) to authenticated, service_role;
grant execute on function private.my_readable_member_ids() to authenticated, service_role;
grant execute on function private.my_readable_company_ids() to authenticated, service_role;

-- Own-data SELECT policies move from my_member_ids() to my_readable_member_ids().
-- The manager and HR branches are unchanged.

drop policy companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (id in (select private.my_readable_company_ids()));

drop policy members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (
    id in (select private.my_readable_member_ids())
    or id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

drop policy member_identities_select on public.member_identities;
create policy member_identities_select on public.member_identities for select to authenticated
  using (
    member_id in (select private.my_readable_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

drop policy device_keys_select on public.device_keys;
create policy device_keys_select on public.device_keys for select to authenticated
  using (
    member_id in (select private.my_readable_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

drop policy key_events_select on public.key_events;
create policy key_events_select on public.key_events for select to authenticated
  using (
    member_id in (select private.my_readable_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

drop policy punches_select on public.punches;
create policy punches_select on public.punches for select to authenticated
  using (
    member_id in (select private.my_readable_member_ids())
    or member_id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

drop policy punch_corrections_select on public.punch_corrections;
create policy punch_corrections_select on public.punch_corrections for select to authenticated
  using (
    member_id in (select private.my_readable_member_ids())
    or member_id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

drop policy leave_types_select on public.leave_types;
create policy leave_types_select on public.leave_types for select to authenticated
  using (company_id in (select private.my_readable_company_ids()));

drop policy leave_balances_select on public.leave_balances;
create policy leave_balances_select on public.leave_balances for select to authenticated
  using (
    member_id in (select private.my_readable_member_ids())
    or member_id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

drop policy leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (
    member_id in (select private.my_readable_member_ids())
    or member_id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

drop policy documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (
    (member_id in (select private.my_readable_member_ids()) and status in ('published', 'superseded'))
    or company_id in (select private.my_hr_company_ids())
  );

drop policy document_key_wraps_select on public.document_key_wraps;
create policy document_key_wraps_select on public.document_key_wraps for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and d.member_id in (select private.my_readable_member_ids())
        and d.status in ('published', 'superseded')
    )
  );

drop policy document_access_events_select on public.document_access_events;
create policy document_access_events_select on public.document_access_events for select to authenticated
  using (
    member_id in (select private.my_readable_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

-- A former employee keeps the GDPR rights (art. 15–22): they may still file requests.
drop policy gdpr_requests_select on public.gdpr_requests;
create policy gdpr_requests_select on public.gdpr_requests for select to authenticated
  using (
    member_id in (select private.my_readable_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );
drop policy gdpr_requests_insert on public.gdpr_requests;
create policy gdpr_requests_insert on public.gdpr_requests for insert to authenticated
  with check (
    member_id in (select private.my_readable_member_ids())
    and company_id in (select private.my_readable_company_ids())
  );

-- Opening and downloading documents, and the art. 15/20 export, follow the same window.
create or replace function public.mark_document_opened(p_document_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  d public.documents;
begin
  update public.documents set first_opened_at = coalesce(first_opened_at, now())
  where id = p_document_id
    and member_id in (select private.my_readable_member_ids())
    and status in ('published', 'superseded')
  returning * into d;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.document_access_events (company_id, document_id, member_id, actor_member_id, event)
  values (d.company_id, d.id, d.member_id, d.member_id, 'opened');
end;
$$;

create or replace function public.svc_document_download(p_document_id uuid, p_auth_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  d public.documents;
  v_wrap text;
begin
  select doc.* into d
  from public.documents doc
  join public.members m on m.id = doc.member_id
  where doc.id = p_document_id
    and doc.status in ('published', 'superseded')
    and m.auth_user_id = p_auth_user_id
    and private.has_own_access(m.status, m.terminated_on);
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select wrapped_key into v_wrap from public.document_key_wraps
  where document_id = d.id and device_key_id = d.device_key_id;

  insert into public.document_access_events (company_id, document_id, member_id, actor_member_id, event)
  values (d.company_id, d.id, d.member_id, d.member_id, 'downloaded');

  return jsonb_build_object(
    'document_id', d.id, 'member_id', d.member_id, 'storage_path', d.storage_path,
    'format', d.format, 'nonce', d.nonce, 'wrapped_key', v_wrap,
    'device_key_id', d.device_key_id, 'ciphertext_sha256', d.ciphertext_sha256,
    'size_bytes', d.size_bytes);
end;
$$;

create or replace function public.export_my_data()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with mine as (select private.my_readable_member_ids() as id)
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

-- HR can still send documents (final payslip, CU) to a former employee during the window.
create or replace function public.create_payroll_batch(
  p_company_id uuid,
  p_kind public.document_kind,
  p_period date,
  p_title text,
  p_items jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.require_member(p_company_id, '{hr_admin,company_owner}');
  v_batch uuid;
  item jsonb;
  v_doc uuid;
  v_member uuid;
  v_key uuid;
  v_supersedes uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 2000 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  insert into public.payroll_batches (company_id, kind, period, title, created_by)
  values (p_company_id, p_kind, date_trunc('month', p_period)::date, trim(p_title), me.id)
  returning id into v_batch;

  for item in select * from jsonb_array_elements(p_items) loop
    v_doc := (item ->> 'document_id')::uuid;
    v_member := (item ->> 'member_id')::uuid;
    v_key := (item ->> 'device_key_id')::uuid;
    v_supersedes := (item ->> 'supersedes_id')::uuid;

    if not exists (
      select 1 from public.device_keys k
      join public.members m on m.id = k.member_id
      where k.id = v_key and k.member_id = v_member and k.company_id = p_company_id
        and k.status = 'active' and private.has_own_access(m.status, m.terminated_on)
    ) then
      raise exception 'device_key_not_active' using errcode = 'P0001', detail = v_member::text;
    end if;

    if v_supersedes is not null and not exists (
      select 1 from public.documents
      where id = v_supersedes and member_id = v_member and company_id = p_company_id
        and status = 'published'
    ) then
      raise exception 'supersedes_invalid' using errcode = 'P0001', detail = v_supersedes::text;
    end if;

    insert into public.documents (
      id, company_id, member_id, batch_id, kind, title, period, device_key_id, storage_path,
      nonce, ciphertext_sha256, size_bytes, supersedes_id, created_by)
    values (
      v_doc, p_company_id, v_member, v_batch, p_kind,
      coalesce(nullif(trim(item ->> 'title'), ''), trim(p_title)),
      date_trunc('month', p_period)::date, v_key,
      p_company_id::text || '/' || v_member::text || '/' || v_doc::text || '.bin',
      item ->> 'nonce', item ->> 'ciphertext_sha256', (item ->> 'size_bytes')::int,
      v_supersedes, me.id);

    insert into public.document_key_wraps (document_id, device_key_id, wrapped_key)
    values (v_doc, v_key, item ->> 'wrapped_key');
  end loop;

  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- Punches signed before a suspension or a termination still count
-- ---------------------------------------------------------------------------

create or replace function public.svc_get_device_key(p_device_key_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', k.id, 'company_id', k.company_id, 'member_id', k.member_id,
    'auth_user_id', m.auth_user_id, 'member_status', m.status,
    'member_status_changed_at', m.status_changed_at,
    'ed25519_public_key', k.ed25519_public_key, 'status', k.status,
    'created_at', k.created_at, 'revoked_at', k.revoked_at)
  from public.device_keys k
  join public.members m on m.id = k.member_id
  where k.id = p_device_key_id;
$$;

create or replace function public.svc_record_punch(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_key public.device_keys;
  v_kiosk public.kiosk_devices;
  v_existing public.punches;
  v_row public.punches;
  v_flags text[] := coalesce(array(select jsonb_array_elements_text(p -> 'flags')), '{}');
  v_device_ts timestamptz := (p ->> 'device_ts')::timestamptz;
  v_received_at timestamptz := coalesce((p ->> 'received_at')::timestamptz, now());
  v_method public.punch_method := (p ->> 'method')::public.punch_method;
  v_prev public.punch_type;
begin
  if v_method = 'manual' then
    raise exception 'manual punches come from corrections' using errcode = '22023';
  end if;

  select * into v_existing from public.punches
  where device_key_id = (p ->> 'device_key_id')::uuid and client_punch_id = (p ->> 'client_punch_id')::uuid;
  if found then
    return jsonb_build_object(
      'id', v_existing.id, 'receipt_code', v_existing.receipt_code,
      'receipt_signature', v_existing.receipt_signature, 'received_at', v_existing.received_at,
      'flags', to_jsonb(v_existing.flags), 'duplicate', true);
  end if;

  -- Active, or suspended/terminated after the punch was signed (offline queue).
  select * into v_member from public.members
  where id = (p ->> 'member_id')::uuid and company_id = (p ->> 'company_id')::uuid;
  if not found
     or not (v_member.status = 'active'
             or (v_member.status in ('suspended', 'terminated')
                 and v_member.status_changed_at is not null
                 and v_device_ts < v_member.status_changed_at)) then
    raise exception 'member_not_active' using errcode = '42501';
  end if;

  -- The key must belong to the member and have been valid when the punch was
  -- made: offline punches signed before a revocation are still accepted.
  select * into v_key from public.device_keys
  where id = (p ->> 'device_key_id')::uuid and member_id = v_member.id;
  if not found
     or v_key.created_at > v_received_at
     or (v_key.status = 'revoked' and v_key.revoked_at <= v_device_ts) then
    raise exception 'device_key_invalid' using errcode = '42501';
  end if;

  if v_method = 'qr' then
    select * into v_kiosk from public.kiosk_devices where id = (p ->> 'kiosk_id')::uuid;
    if not found or v_kiosk.company_id <> v_member.company_id or v_kiosk.status <> 'active'
       or v_kiosk.site_id is distinct from (p ->> 'site_id')::uuid then
      raise exception 'kiosk_invalid' using errcode = '42501';
    end if;
  end if;

  select punch_type into v_prev from public.punches
  where member_id = v_member.id and device_ts < v_device_ts
  order by device_ts desc limit 1;
  if v_prev is not distinct from (p ->> 'punch_type')::public.punch_type then
    v_flags := array_append(v_flags, 'sequence');
  end if;

  begin
    insert into public.punches (
      id, company_id, member_id, punch_type, method, site_id, kiosk_id, device_key_id,
      client_punch_id, in_geofence, device_ts, received_at, qr_window, signed_payload,
      signature, receipt_code, receipt_signature, flags)
    values (
      coalesce((p ->> 'id')::uuid, gen_random_uuid()), v_member.company_id, v_member.id,
      (p ->> 'punch_type')::public.punch_type, v_method, (p ->> 'site_id')::uuid,
      (p ->> 'kiosk_id')::uuid, v_key.id, (p ->> 'client_punch_id')::uuid,
      (p ->> 'in_geofence')::boolean, v_device_ts, v_received_at, (p ->> 'qr_window')::bigint,
      p ->> 'signed_payload', p ->> 'signature',
      coalesce(p ->> 'receipt_code', private.new_receipt_code()), p ->> 'receipt_signature',
      (select coalesce(array_agg(distinct f order by f), '{}') from unnest(v_flags) f))
    returning * into v_row;
  exception when unique_violation then
    if v_method = 'qr' then
      raise exception 'qr_token_reused' using errcode = 'P0001';
    end if;
    raise;
  end;

  return jsonb_build_object(
    'id', v_row.id, 'receipt_code', v_row.receipt_code,
    'receipt_signature', v_row.receipt_signature, 'received_at', v_row.received_at,
    'flags', to_jsonb(v_row.flags), 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- E1 · set_member_status: suspend, reactivate, terminate
-- ---------------------------------------------------------------------------

drop function public.set_member_status(uuid, public.member_status);

-- Returns {status, terminated_on, cancelled_requests, reports}: `reports` is the
-- number of members whose manager is this person, so HR can reassign them.
create function public.set_member_status(
  p_member_id uuid,
  p_status public.member_status,
  p_terminated_on date default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  target public.members;
  me public.members;
  v_cancelled int := 0;
  v_reports int;
begin
  if p_status not in ('active', 'suspended', 'terminated') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select * into target from public.members where id = p_member_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(target.company_id, '{hr_admin,company_owner}');

  if target.id = me.id or target.status in ('erased', 'invited') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target.role in ('hr_admin', 'company_owner') and me.role <> 'company_owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target.role = 'company_owner' and p_status <> 'active' and target.status = 'active'
     and (select count(*) from public.members
          where company_id = target.company_id and role = 'company_owner' and status = 'active') <= 1 then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  if p_status = 'terminated' then
    if p_terminated_on is null then
      raise exception 'termination_date_required' using errcode = '22023';
    end if;
    -- Recorded on or after the last working day, never in advance (it takes effect at once).
    if p_terminated_on > current_date or p_terminated_on < current_date - 366 then
      raise exception 'termination_date_invalid' using errcode = '22023';
    end if;
  end if;

  update public.members
  set status = p_status,
      terminated_on = case when p_status = 'terminated' then p_terminated_on end,
      status_changed_at = case when status = p_status then status_changed_at else now() end
  where id = target.id;

  if p_status = 'terminated' then
    -- Leave that would start after the last day can no longer happen. Earlier
    -- pending requests and corrections stay for HR to decide.
    update public.leave_requests
    set status = 'cancelled', decided_by = me.id, decided_at = now(),
        decision_note = 'Rapporto di lavoro cessato'
    where member_id = target.id and status = 'pending' and start_date > p_terminated_on;
    get diagnostics v_cancelled = row_count;
  end if;

  select count(*) into v_reports from public.members
  where manager_member_id = target.id and status not in ('erased', 'terminated');

  return jsonb_build_object(
    'status', p_status,
    'terminated_on', case when p_status = 'terminated' then p_terminated_on end,
    'cancelled_requests', v_cancelled,
    'reports', v_reports);
end;
$$;

revoke execute on function public.set_member_status(uuid, public.member_status, date) from public, anon;
grant execute on function public.set_member_status(uuid, public.member_status, date) to authenticated;

-- ---------------------------------------------------------------------------
-- E3 · update_member: the portal's path for HR edits
-- ---------------------------------------------------------------------------

-- The e-mail is the login of an active member (auth.users), so it can only be
-- corrected while the member is still invited; pending invitations to the old
-- address are revoked and HR invites again. The codice fiscale decides which
-- payslip pages a member receives: every change lands in audit_log.
create function public.update_member(
  p_member_id uuid,
  p_full_name text,
  p_email text,
  p_codice_fiscale text,
  p_employee_number text,
  p_site_id uuid,
  p_manager_member_id uuid,
  p_preferred_language text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  target public.members;
  me public.members;
  v_identity public.member_identities;
  v_email text := nullif(lower(trim(p_email)), '');
begin
  select * into target from public.members where id = p_member_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(target.company_id, '{hr_admin,company_owner}');
  if target.status = 'erased' then
    raise exception 'member_erased' using errcode = 'P0001';
  end if;
  if target.role in ('hr_admin', 'company_owner') and me.role <> 'company_owner' and target.id <> me.id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_manager_member_id = target.id then
    raise exception 'manager_invalid' using errcode = '22023';
  end if;
  if p_manager_member_id is not null and not exists (
    select 1 from public.members
    where id = p_manager_member_id and company_id = target.company_id and status = 'active'
  ) then
    raise exception 'manager_invalid' using errcode = '22023';
  end if;

  select * into v_identity from public.member_identities where member_id = target.id for update;
  if v_email is distinct from v_identity.email then
    if target.status <> 'invited' then
      raise exception 'email_locked' using errcode = 'P0001';
    end if;
    update public.invitations set status = 'revoked' where member_id = target.id and status = 'pending';
  end if;

  update public.members
  set full_name = trim(p_full_name),
      employee_number = nullif(trim(p_employee_number), ''),
      site_id = p_site_id,
      manager_member_id = p_manager_member_id,
      preferred_language = coalesce(nullif(trim(p_preferred_language), ''), preferred_language)
  where id = target.id;

  update public.member_identities
  set email = v_email, codice_fiscale = private.normalize_cf(p_codice_fiscale)
  where member_id = target.id;
end;
$$;

revoke execute on function public.update_member(uuid, text, text, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.update_member(uuid, text, text, text, text, uuid, uuid, text) to authenticated;
