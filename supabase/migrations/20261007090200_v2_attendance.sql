-- Fide v2 · 2/5 — Attendance.
--
-- punches are append-only and never written by clients directly: the
-- punch-sync Edge Function verifies the Ed25519 device signature (and the
-- kiosk QR HMAC) and then calls svc_record_punch(). Missed punches go through
-- punch_corrections and, once approved, become `manual` punches.

create type public.punch_type as enum ('in', 'out');
create type public.punch_method as enum ('geo', 'qr', 'manual');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.punch_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  member_id uuid not null,
  punch_type public.punch_type not null,
  requested_ts timestamptz not null,
  site_id uuid,
  reason text not null check (char_length(reason) between 3 and 500),
  status public.request_status not null default 'pending',
  decided_by uuid references public.members (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, member_id) references public.members (company_id, id),
  foreign key (company_id, site_id) references public.sites (company_id, id) on delete set null (site_id),
  check (requested_ts <= created_at + interval '5 minutes')
);

create index punch_corrections_company_status on public.punch_corrections (company_id, status);
create index punch_corrections_member on public.punch_corrections (member_id, created_at desc);

create table public.punches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  member_id uuid not null,
  punch_type public.punch_type not null,
  method public.punch_method not null,
  site_id uuid,
  kiosk_id uuid references public.kiosk_devices (id),
  device_key_id uuid,
  client_punch_id uuid,
  in_geofence boolean,
  device_ts timestamptz not null,
  received_at timestamptz not null default now(),
  qr_window bigint,
  -- Exact bytes that were signed ("FIDE-PUNCH-v1\n" + canonical JSON), kept so
  -- anyone holding the public key can re-verify the punch later.
  signed_payload text,
  signature text check (signature is null or public.b64_len(signature) = 64),
  receipt_code text not null unique,
  receipt_signature text check (receipt_signature is null or public.b64_len(receipt_signature) = 64),
  flags text[] not null default '{}',
  correction_id uuid unique references public.punch_corrections (id),
  foreign key (company_id, member_id) references public.members (company_id, id),
  foreign key (member_id, device_key_id) references public.device_keys (member_id, id),
  foreign key (company_id, site_id) references public.sites (company_id, id),
  unique (device_key_id, client_punch_id),
  check (
    (method = 'manual'
      and correction_id is not null and device_key_id is null and client_punch_id is null
      and signed_payload is null and signature is null)
    or
    (method <> 'manual'
      and correction_id is null and device_key_id is not null and client_punch_id is not null
      and signed_payload is not null and signature is not null and receipt_signature is not null)
  ),
  check (method <> 'qr' or (kiosk_id is not null and qr_window is not null)),
  check (method <> 'geo' or in_geofence is not null)
);

-- A kiosk QR window can be used once per member.
create unique index punches_qr_single_use on public.punches (member_id, kiosk_id, qr_window) where method = 'qr';
create index punches_company_ts on public.punches (company_id, device_ts desc);
create index punches_member_ts on public.punches (member_id, device_ts desc);

create trigger punches_append_only before update or delete on public.punches
  for each row execute function private.forbid_mutation();
create trigger punch_corrections_updated_at before update on public.punch_corrections
  for each row execute function private.set_updated_at();

create function private.new_receipt_code()
returns text
language sql volatile
set search_path = ''
as $$
  select 'REC-' || upper(encode(extensions.gen_random_bytes(6), 'hex'));
$$;

-- ---------------------------------------------------------------------------
-- service_role: record a punch that punch-sync has already verified.
--
-- Re-checks every relationship (defence in depth), adds the `sequence` flag and
-- is idempotent on (device_key_id, client_punch_id): a retried sync gets the
-- original receipt back.
-- ---------------------------------------------------------------------------

create function public.svc_record_punch(p jsonb)
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

  select * into v_member from public.members
  where id = (p ->> 'member_id')::uuid and company_id = (p ->> 'company_id')::uuid;
  if not found or v_member.status <> 'active' then
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

-- Active device key (and status) of a member, for punch-sync.
create function public.svc_get_device_key(p_device_key_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', k.id, 'company_id', k.company_id, 'member_id', k.member_id,
    'auth_user_id', m.auth_user_id, 'member_status', m.status,
    'ed25519_public_key', k.ed25519_public_key, 'status', k.status,
    'created_at', k.created_at, 'revoked_at', k.revoked_at)
  from public.device_keys k
  join public.members m on m.id = k.member_id
  where k.id = p_device_key_id;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: corrections
-- ---------------------------------------------------------------------------

create function public.decide_punch_correction(p_correction_id uuid, p_approve boolean, p_note text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.punch_corrections;
  me public.members;
  v_punch uuid;
begin
  select * into c from public.punch_corrections where id = p_correction_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(c.company_id);
  if me.id = c.member_id
     or not (me.role in ('hr_admin', 'company_owner')
             or c.member_id in (select private.my_managed_member_ids())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'pending' then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;

  if p_approve then
    insert into public.punches (company_id, member_id, punch_type, method, site_id, device_ts,
                                receipt_code, flags, correction_id)
    values (c.company_id, c.member_id, c.punch_type, 'manual', c.site_id, c.requested_ts,
            private.new_receipt_code(), '{manual_correction}', c.id)
    returning id into v_punch;
  end if;

  update public.punch_corrections
  set status = case when p_approve then 'approved'::public.request_status else 'rejected' end,
      decided_by = me.id, decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = c.id;

  return v_punch;
end;
$$;

create function public.cancel_punch_correction(p_correction_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.punch_corrections set status = 'cancelled'
  where id = p_correction_id and status = 'pending'
    and member_id in (select private.my_member_ids());
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.punches enable row level security;
alter table public.punch_corrections enable row level security;

create policy punches_select on public.punches for select to authenticated
  using (
    member_id in (select private.my_member_ids())
    or member_id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

create policy punch_corrections_select on public.punch_corrections for select to authenticated
  using (
    member_id in (select private.my_member_ids())
    or member_id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );
create policy punch_corrections_insert on public.punch_corrections for insert to authenticated
  with check (
    member_id in (select private.my_member_ids())
    and company_id in (select private.my_company_ids())
  );

revoke all on public.punches, public.punch_corrections from anon, authenticated;
grant select on public.punches to authenticated;
grant select on public.punch_corrections to authenticated;
grant insert (company_id, member_id, punch_type, requested_ts, site_id, reason)
  on public.punch_corrections to authenticated;
