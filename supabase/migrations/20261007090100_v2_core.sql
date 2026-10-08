-- Fide v2 · 1/5 — Tenancy core.
--
-- companies, sites, members (+ member_identities), invitations, kiosks and
-- device keys, plus the RLS helper functions every later migration relies on.
--
-- Conventions
--   * Every table has RLS; clients only get the column grants listed per table.
--   * Writes that need cross-row checks go through SECURITY DEFINER RPCs with
--     `set search_path = ''` and an explicit authorization check at the top.
--   * `svc_*` functions are for Edge Functions (service_role) only.
--   * Keys, signatures, nonces: standard base64 (padded). Digests: lowercase hex.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('employee', 'manager', 'hr_admin', 'company_owner');
create type public.member_status as enum ('invited', 'active', 'suspended', 'erased');
create type public.invitation_status as enum ('pending', 'redeemed', 'revoked');
create type public.kiosk_status as enum ('pairing', 'active', 'revoked');
create type public.key_status as enum ('active', 'revoked');
create type public.key_event_kind as enum ('registered', 'revoked');

-- ---------------------------------------------------------------------------
-- Pure validators (mirror app/packages/shared/src/italy)
-- ---------------------------------------------------------------------------

create function public.is_valid_codice_fiscale(p_value text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  -- Values for odd positions, indexed by A..Z (digits 0..9 share A..J's values).
  odd constant int[] := array[1,0,5,7,9,13,15,17,19,21,2,4,18,20,11,3,6,8,12,14,16,10,22,25,24,23];
  s int := 0;
  c int;
  v int;
begin
  if p_value is null
     or p_value !~ '^[A-Z]{6}[0-9LMNP-V]{2}[ABCDEHLMPRST][0-9LMNP-V]{2}[A-Z][0-9LMNP-V]{3}[A-Z]$' then
    return false;
  end if;
  for i in 1..15 loop
    c := ascii(substr(p_value, i, 1));
    v := case when c between 48 and 57 then c - 48 else c - 65 end;
    s := s + case when i % 2 = 1 then odd[v + 1] else v end;
  end loop;
  return chr(65 + s % 26) = substr(p_value, 16, 1);
end;
$$;

create function public.is_valid_partita_iva(p_value text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  s int := 0;
  d int;
begin
  if p_value is null or p_value !~ '^[0-9]{11}$' or p_value = '00000000000' then
    return false;
  end if;
  for i in 1..10 loop
    d := ascii(substr(p_value, i, 1)) - 48;
    if i % 2 = 0 then
      d := d * 2;
      if d > 9 then d := d - 9; end if;
    end if;
    s := s + d;
  end loop;
  return (10 - s % 10) % 10 = ascii(substr(p_value, 11, 1)) - 48;
end;
$$;

-- Decoded length of a base64 string, or -1 when it is not valid base64.
create function public.b64_len(p_value text)
returns int
language plpgsql immutable
set search_path = ''
as $$
begin
  return length(decode(p_value, 'base64'));
exception when others then
  return -1;
end;
$$;

-- First 12 bytes of SHA-256(x25519 ‖ ed25519), uppercase hex in groups of 4.
-- Shown in the app and the portal so HR and the employee can compare keys.
create function public.key_fingerprint(p_x25519 text, p_ed25519 text)
returns text
language sql immutable
set search_path = ''
as $$
  select upper(regexp_replace(
    encode(substring(sha256(decode(p_x25519, 'base64') || decode(p_ed25519, 'base64')) from 1 for 12), 'hex'),
    '(.{4})(?!$)', '\1 ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Append-only tables. Only the retention purge may delete, by setting
-- `fide.allow_purge = on` for its own transaction.
create function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('fide.allow_purge', true) = 'on' then
    return old;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  vat_number text not null unique check (public.is_valid_partita_iva(vat_number)),
  fiscal_code text check (
    fiscal_code is null
    or public.is_valid_partita_iva(fiscal_code)
    or public.is_valid_codice_fiscale(fiscal_code)
  ),
  pec text check (pec is null or pec ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  sdi_code text check (sdi_code is null or sdi_code ~ '^[A-Z0-9]{7}$'),
  inps_matricola text check (inps_matricola is null or inps_matricola ~ '^[0-9]{10}$'),
  ccnl text check (ccnl is null or char_length(ccnl) <= 120),
  address text check (address is null or char_length(address) <= 300),
  country text not null default 'IT' check (country = 'IT'),
  timezone text not null default 'Europe/Rome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  address text check (address is null or char_length(address) <= 300),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  radius_m integer not null default 150 check (radius_m between 30 and 2000),
  -- QR-first: geolocation stays off until the company has cleared Art. 4 L. 300/1970.
  geo_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  check (not geo_enabled or (latitude is not null and longitude is not null))
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  role public.member_role not null default 'employee',
  status public.member_status not null default 'invited',
  full_name text not null check (char_length(full_name) between 1 and 200),
  site_id uuid,
  manager_member_id uuid,
  employee_number text check (employee_number is null or char_length(employee_number) <= 40),
  preferred_language text not null default 'it'
    check (preferred_language in ('it', 'es', 'en', 'ro', 'ar', 'sq', 'uk', 'fr', 'zh')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, auth_user_id),
  foreign key (company_id, site_id) references public.sites (company_id, id) on delete set null (site_id),
  foreign key (company_id, manager_member_id) references public.members (company_id, id)
    on delete set null (manager_member_id),
  check (manager_member_id is null or manager_member_id <> id),
  -- An active member is always linked to a login. Erase through the GDPR flow
  -- before deleting the auth user.
  check (status <> 'active' or auth_user_id is not null)
);

create index members_auth_user_id on public.members (auth_user_id) where auth_user_id is not null;
create index members_manager on public.members (manager_member_id) where manager_member_id is not null;

-- Identity data lives apart from `members` so managers can see their team
-- without seeing tax codes or e-mail addresses (data minimisation).
create table public.member_identities (
  member_id uuid primary key,
  company_id uuid not null,
  email text check (email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  codice_fiscale text check (codice_fiscale is null or public.is_valid_codice_fiscale(codice_fiscale)),
  updated_at timestamptz not null default now(),
  foreign key (company_id, member_id) references public.members (company_id, id) on delete cascade
);

create unique index member_identities_email on public.member_identities (company_id, email) where email is not null;
create unique index member_identities_cf on public.member_identities (company_id, codice_fiscale)
  where codice_fiscale is not null;

create table private.app_settings (
  key text primary key,
  value text not null
);
-- 'allowlist' during the pilot: only e-mails in private.signup_allowlist may register a company.
insert into private.app_settings (key, value) values ('signup_mode', 'allowlist');

create table private.signup_allowlist (
  email text primary key check (email = lower(email)),
  note text,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  member_id uuid not null,
  email text not null,
  token_hash bytea not null unique check (length(token_hash) = 32),
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  foreign key (company_id, member_id) references public.members (company_id, id) on delete cascade
);

create index invitations_member on public.invitations (member_id);

create table public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  site_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  status public.kiosk_status not null default 'pairing',
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  paired_at timestamptz,
  revoked_at timestamptz,
  foreign key (company_id, site_id) references public.sites (company_id, id) on delete cascade
);

-- Never reachable through the API: the HMAC secret behind the rotating QR.
create table private.kiosk_secrets (
  kiosk_id uuid primary key references public.kiosk_devices (id) on delete cascade,
  secret bytea check (secret is null or length(secret) = 32),
  pairing_code_hash bytea unique,
  pairing_expires_at timestamptz
);

create table public.device_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  member_id uuid not null,
  x25519_public_key text not null check (public.b64_len(x25519_public_key) = 32),
  ed25519_public_key text not null check (public.b64_len(ed25519_public_key) = 32),
  fingerprint text generated always as (public.key_fingerprint(x25519_public_key, ed25519_public_key)) stored,
  device_label text check (device_label is null or char_length(device_label) <= 80),
  status public.key_status not null default 'active',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (member_id, id),
  foreign key (company_id, member_id) references public.members (company_id, id),
  check ((status = 'revoked') = (revoked_at is not null))
);

create unique index device_keys_one_active on public.device_keys (member_id) where status = 'active';

create table public.key_events (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  member_id uuid not null,
  device_key_id uuid not null references public.device_keys (id),
  kind public.key_event_kind not null,
  reason text check (reason is null or char_length(reason) <= 200),
  actor_member_id uuid references public.members (id),
  created_at timestamptz not null default now(),
  foreign key (company_id, member_id) references public.members (company_id, id)
);

create index key_events_member on public.key_events (member_id, created_at desc);

create trigger companies_updated_at before update on public.companies
  for each row execute function private.set_updated_at();
create trigger sites_updated_at before update on public.sites
  for each row execute function private.set_updated_at();
create trigger members_updated_at before update on public.members
  for each row execute function private.set_updated_at();
create trigger member_identities_updated_at before update on public.member_identities
  for each row execute function private.set_updated_at();
create trigger key_events_append_only before update or delete on public.key_events
  for each row execute function private.forbid_mutation();

-- ---------------------------------------------------------------------------
-- RLS helpers. Used as `x in (select private.fn())` so they run once per query.
-- ---------------------------------------------------------------------------

create function private.my_member_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.id from public.members m
  where m.auth_user_id = (select auth.uid()) and m.status = 'active';
$$;

create function private.my_company_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.company_id from public.members m
  where m.auth_user_id = (select auth.uid()) and m.status = 'active';
$$;

create function private.my_hr_company_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.company_id from public.members m
  where m.auth_user_id = (select auth.uid())
    and m.status = 'active'
    and m.role in ('hr_admin', 'company_owner');
$$;

create function private.my_managed_member_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select e.id
  from public.members e
  join public.members mgr on mgr.id = e.manager_member_id and mgr.company_id = e.company_id
  where mgr.auth_user_id = (select auth.uid()) and mgr.status = 'active';
$$;

-- For RPCs: the caller's active membership in a company (optionally with one of
-- the given roles), or an error.
create function private.require_member(p_company_id uuid, p_roles public.member_role[] default null)
returns public.members
language plpgsql stable security definer
set search_path = ''
as $$
declare
  m public.members;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into m from public.members
  where company_id = p_company_id and auth_user_id = auth.uid() and status = 'active';
  if not found or (p_roles is not null and not (m.role = any (p_roles))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return m;
end;
$$;

create function private.normalize_cf(p_value text)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_value, ''), '\s', '', 'g')), '');
$$;

create function private.random_token()
returns text
language sql volatile
set search_path = ''
as $$
  -- 32 random bytes as unpadded base64url.
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/=\n', '-_');
$$;

-- ---------------------------------------------------------------------------
-- RPCs: companies and members
-- ---------------------------------------------------------------------------

create function public.register_company(
  p_legal_name text,
  p_vat_number text,
  p_owner_full_name text,
  p_fiscal_code text default null,
  p_pec text default null,
  p_sdi_code text default null,
  p_inps_matricola text default null,
  p_ccnl text default null,
  p_address text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_company_id uuid;
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  if coalesce((select value from private.app_settings where key = 'signup_mode'), 'allowlist') <> 'open'
     and not exists (select 1 from private.signup_allowlist a where a.email = v_email) then
    raise exception 'signup_not_allowed' using errcode = '42501';
  end if;

  insert into public.companies (legal_name, vat_number, fiscal_code, pec, sdi_code, inps_matricola, ccnl, address)
  values (
    trim(p_legal_name),
    regexp_replace(p_vat_number, '\s', '', 'g'),
    private.normalize_cf(p_fiscal_code),
    nullif(lower(trim(p_pec)), ''),
    nullif(upper(trim(p_sdi_code)), ''),
    nullif(trim(p_inps_matricola), ''),
    nullif(trim(p_ccnl), ''),
    nullif(trim(p_address), '')
  )
  returning id into v_company_id;

  insert into public.members (company_id, auth_user_id, role, status, full_name)
  values (v_company_id, v_uid, 'company_owner', 'active', trim(p_owner_full_name))
  returning id into v_member_id;

  insert into public.member_identities (member_id, company_id, email)
  values (v_member_id, v_company_id, v_email);

  return v_company_id;
end;
$$;

create function public.add_member(
  p_company_id uuid,
  p_full_name text,
  p_email text default null,
  p_codice_fiscale text default null,
  p_site_id uuid default null,
  p_manager_member_id uuid default null,
  p_employee_number text default null,
  p_role public.member_role default 'employee',
  p_preferred_language text default 'it'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.require_member(p_company_id, '{hr_admin,company_owner}');
  v_id uuid;
begin
  if p_role in ('hr_admin', 'company_owner') and me.role <> 'company_owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.members (company_id, role, full_name, site_id, manager_member_id, employee_number, preferred_language)
  values (p_company_id, p_role, trim(p_full_name), p_site_id, p_manager_member_id,
          nullif(trim(p_employee_number), ''), coalesce(p_preferred_language, 'it'))
  returning id into v_id;

  insert into public.member_identities (member_id, company_id, email, codice_fiscale)
  values (v_id, p_company_id, nullif(lower(trim(p_email)), ''), private.normalize_cf(p_codice_fiscale));

  return v_id;
end;
$$;

create function public.set_member_role(p_member_id uuid, p_role public.member_role)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  target public.members;
  me public.members;
begin
  select * into target from public.members where id = p_member_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(target.company_id, '{hr_admin,company_owner}');

  if target.status = 'erased' then
    raise exception 'member_erased' using errcode = 'P0001';
  end if;
  -- Only owners grant or take away HR/owner powers.
  if (p_role in ('hr_admin', 'company_owner') or target.role in ('hr_admin', 'company_owner'))
     and me.role <> 'company_owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target.role = 'company_owner' and p_role <> 'company_owner'
     and (select count(*) from public.members
          where company_id = target.company_id and role = 'company_owner' and status = 'active') <= 1 then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  update public.members set role = p_role where id = p_member_id;
end;
$$;

create function public.set_member_status(p_member_id uuid, p_status public.member_status)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  target public.members;
  me public.members;
begin
  if p_status not in ('active', 'suspended') then
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

  update public.members set status = p_status where id = p_member_id;
end;
$$;

create function public.set_my_language(p_language text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  update public.members set preferred_language = p_language where auth_user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: invitations
-- ---------------------------------------------------------------------------

-- Returns the raw token exactly once; only its SHA-256 is stored. The portal
-- turns it into https://app.<domain>/invite/<token>.
create function public.create_invitation(p_member_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  target public.members;
  me public.members;
  v_email text;
  v_token text := private.random_token();
begin
  select * into target from public.members where id = p_member_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(target.company_id, '{hr_admin,company_owner}');

  if target.status <> 'invited' then
    raise exception 'member_not_invitable' using errcode = 'P0001';
  end if;
  select email into v_email from public.member_identities where member_id = p_member_id;
  if v_email is null then
    raise exception 'member_email_missing' using errcode = 'P0001';
  end if;

  update public.invitations set status = 'revoked'
  where member_id = p_member_id and status = 'pending';

  insert into public.invitations (company_id, member_id, email, token_hash, created_by)
  values (target.company_id, p_member_id, v_email, sha256(convert_to(v_token, 'UTF8')), me.id);

  return v_token;
end;
$$;

create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_member(inv.company_id, '{hr_admin,company_owner}');
  update public.invitations set status = 'revoked' where id = p_invitation_id and status = 'pending';
end;
$$;

-- Called by the employee right after their first OTP sign-in. The signed-in
-- e-mail must be the invited one, so a forwarded link is useless.
create function public.redeem_invitation(p_token text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  inv public.invitations;
  target public.members;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select lower(u.email) into v_email from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  select * into inv from public.invitations
  where token_hash = sha256(convert_to(p_token, 'UTF8'))
  for update;
  if not found or inv.status <> 'pending' or inv.expires_at < now() then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;
  if inv.email <> v_email then
    raise exception 'invitation_email_mismatch' using errcode = '42501';
  end if;

  select * into target from public.members where id = inv.member_id for update;
  if target.status <> 'invited' or target.auth_user_id is not null then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.members where company_id = inv.company_id and auth_user_id = v_uid) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  update public.members set auth_user_id = v_uid, status = 'active' where id = target.id;
  update public.invitations set status = 'redeemed', redeemed_at = now() where id = inv.id;

  return target.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: kiosks
-- ---------------------------------------------------------------------------

-- Creates a kiosk in `pairing` state and returns a one-time 8-character code
-- (valid 10 minutes) that the tablet exchanges for its HMAC secret.
create function public.create_kiosk(p_site_id uuid, p_name text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.sites;
  me public.members;
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- 32 symbols, no 0/O/1/I
  b bytea := extensions.gen_random_bytes(8);
  v_code text := '';
  v_id uuid;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  select * into s from public.sites where id = p_site_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(s.company_id, '{hr_admin,company_owner}');

  for i in 0..7 loop
    v_code := v_code || substr(alphabet, get_byte(b, i) % 32 + 1, 1);
  end loop;

  insert into public.kiosk_devices (company_id, site_id, name, created_by)
  values (s.company_id, s.id, trim(p_name), me.id)
  returning id into v_id;

  insert into private.kiosk_secrets (kiosk_id, pairing_code_hash, pairing_expires_at)
  values (v_id, sha256(convert_to(v_code, 'UTF8')), v_expires);

  return jsonb_build_object('kiosk_id', v_id, 'pairing_code', v_code, 'expires_at', v_expires);
end;
$$;

create function public.revoke_kiosk(p_kiosk_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  k public.kiosk_devices;
begin
  select * into k from public.kiosk_devices where id = p_kiosk_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_member(k.company_id, '{hr_admin,company_owner}');
  update public.kiosk_devices set status = 'revoked', revoked_at = now() where id = p_kiosk_id;
  delete from private.kiosk_secrets where kiosk_id = p_kiosk_id;
end;
$$;

-- service_role: exchange a pairing code for the kiosk secret (returned once).
create function public.svc_pair_kiosk(p_code text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  ks private.kiosk_secrets;
  k public.kiosk_devices;
  v_secret bytea := extensions.gen_random_bytes(32);
begin
  select * into ks from private.kiosk_secrets
  where pairing_code_hash = sha256(convert_to(upper(trim(p_code)), 'UTF8'))
    and pairing_expires_at > now()
  for update;
  if not found then
    raise exception 'pairing_code_invalid' using errcode = 'P0001';
  end if;
  select * into k from public.kiosk_devices where id = ks.kiosk_id for update;
  if k.status <> 'pairing' then
    raise exception 'pairing_code_invalid' using errcode = 'P0001';
  end if;

  update private.kiosk_secrets
  set secret = v_secret, pairing_code_hash = null, pairing_expires_at = null
  where kiosk_id = k.id;
  update public.kiosk_devices set status = 'active', paired_at = now() where id = k.id;

  return jsonb_build_object(
    'kiosk_id', k.id, 'company_id', k.company_id, 'site_id', k.site_id,
    'secret', encode(v_secret, 'base64'));
end;
$$;

-- service_role: kiosk secret for QR verification in punch-sync.
create function public.svc_get_kiosk(p_kiosk_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kiosk_id', k.id, 'company_id', k.company_id, 'site_id', k.site_id,
    'status', k.status, 'secret', encode(s.secret, 'base64'))
  from public.kiosk_devices k
  left join private.kiosk_secrets s on s.kiosk_id = k.id
  where k.id = p_kiosk_id;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: device keys
-- ---------------------------------------------------------------------------

-- Registers the caller's device keys for one company, revoking any previous
-- active key (new phone). Old keys stay in the table so old punches remain
-- verifiable; HR sees the change in key_events and re-issues documents.
create function public.register_device_key(
  p_company_id uuid,
  p_x25519_public_key text,
  p_ed25519_public_key text,
  p_device_label text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.require_member(p_company_id);
  v_old uuid;
  v_new uuid;
begin
  for v_old in
    select id from public.device_keys where member_id = me.id and status = 'active' for update
  loop
    update public.device_keys set status = 'revoked', revoked_at = now() where id = v_old;
    insert into public.key_events (company_id, member_id, device_key_id, kind, reason, actor_member_id)
    values (p_company_id, me.id, v_old, 'revoked', 'replaced', me.id);
  end loop;

  insert into public.device_keys (company_id, member_id, x25519_public_key, ed25519_public_key, device_label)
  values (p_company_id, me.id, p_x25519_public_key, p_ed25519_public_key, nullif(trim(p_device_label), ''))
  returning id into v_new;

  insert into public.key_events (company_id, member_id, device_key_id, kind, actor_member_id)
  values (p_company_id, me.id, v_new, 'registered', me.id);

  return v_new;
end;
$$;

create function public.revoke_device_key(p_device_key_id uuid, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  k public.device_keys;
  me public.members;
begin
  select * into k from public.device_keys where id = p_device_key_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(k.company_id);
  if me.id <> k.member_id and me.role not in ('hr_admin', 'company_owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if k.status = 'revoked' then
    return;
  end if;

  update public.device_keys set status = 'revoked', revoked_at = now() where id = k.id;
  insert into public.key_events (company_id, member_id, device_key_id, kind, reason, actor_member_id)
  values (k.company_id, k.member_id, k.id, 'revoked', coalesce(nullif(trim(p_reason), ''), 'revoked'), me.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.sites enable row level security;
alter table public.members enable row level security;
alter table public.member_identities enable row level security;
alter table public.invitations enable row level security;
alter table public.kiosk_devices enable row level security;
alter table public.device_keys enable row level security;
alter table public.key_events enable row level security;

create policy companies_select on public.companies for select to authenticated
  using (id in (select private.my_company_ids()));
create policy companies_update on public.companies for update to authenticated
  using (id in (select private.my_hr_company_ids()))
  with check (id in (select private.my_hr_company_ids()));

create policy sites_select on public.sites for select to authenticated
  using (company_id in (select private.my_company_ids()));
create policy sites_insert on public.sites for insert to authenticated
  with check (company_id in (select private.my_hr_company_ids()));
create policy sites_update on public.sites for update to authenticated
  using (company_id in (select private.my_hr_company_ids()))
  with check (company_id in (select private.my_hr_company_ids()));
create policy sites_delete on public.sites for delete to authenticated
  using (company_id in (select private.my_hr_company_ids()));

create policy members_select on public.members for select to authenticated
  using (
    id in (select private.my_member_ids())
    or id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );
create policy members_update on public.members for update to authenticated
  using (company_id in (select private.my_hr_company_ids()))
  with check (company_id in (select private.my_hr_company_ids()));

create policy member_identities_select on public.member_identities for select to authenticated
  using (
    member_id in (select private.my_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );
create policy member_identities_update on public.member_identities for update to authenticated
  using (company_id in (select private.my_hr_company_ids()))
  with check (company_id in (select private.my_hr_company_ids()));

create policy invitations_select on public.invitations for select to authenticated
  using (company_id in (select private.my_hr_company_ids()));

create policy kiosk_devices_select on public.kiosk_devices for select to authenticated
  using (company_id in (select private.my_hr_company_ids()));

create policy device_keys_select on public.device_keys for select to authenticated
  using (
    member_id in (select private.my_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

create policy key_events_select on public.key_events for select to authenticated
  using (
    member_id in (select private.my_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );

-- ---------------------------------------------------------------------------
-- Grants (Supabase grants ALL to anon/authenticated by default: start from zero)
-- ---------------------------------------------------------------------------

revoke all on public.companies, public.sites, public.members, public.member_identities,
  public.invitations, public.kiosk_devices, public.device_keys, public.key_events
  from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

grant select on public.companies to authenticated;
grant update (legal_name, fiscal_code, pec, sdi_code, inps_matricola, ccnl, address, timezone)
  on public.companies to authenticated;

grant select, delete on public.sites to authenticated;
grant insert (company_id, name, address, latitude, longitude, radius_m, geo_enabled) on public.sites to authenticated;
grant update (name, address, latitude, longitude, radius_m, geo_enabled) on public.sites to authenticated;

grant select on public.members to authenticated;
grant update (full_name, site_id, manager_member_id, employee_number) on public.members to authenticated;

grant select on public.member_identities to authenticated;
grant update (email, codice_fiscale) on public.member_identities to authenticated;

grant select (id, company_id, member_id, email, status, expires_at, created_by, created_at, redeemed_at)
  on public.invitations to authenticated;

grant select on public.kiosk_devices to authenticated;
grant select on public.device_keys to authenticated;
grant select on public.key_events to authenticated;
