-- Fide v2 · 4/5 — Leave and absence requests.
--
-- Balances are maintained by HR (manually or by CSV import): the payslip is the
-- legal source for remaining days, Fide only mirrors it and subtracts what was
-- approved through the app.

create type public.leave_unit as enum ('days', 'hours');

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_]{2,20}$'),
  name text not null check (char_length(name) between 1 and 80),
  unit public.leave_unit not null,
  requires_approval boolean not null default true,
  tracks_balance boolean not null default true,
  -- MALATTIA: the INPS certificate protocol number replaces approval.
  requires_protocol boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, id)
);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  member_id uuid not null,
  leave_type_id uuid not null,
  year integer not null check (year between 2000 and 2100),
  entitled numeric(7, 2) not null default 0 check (entitled >= 0),
  carried_over numeric(7, 2) not null default 0,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, leave_type_id, year),
  foreign key (company_id, member_id) references public.members (company_id, id),
  foreign key (company_id, leave_type_id) references public.leave_types (company_id, id)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  member_id uuid not null,
  leave_type_id uuid not null,
  start_date date not null,
  end_date date not null,
  quantity numeric(7, 2) not null check (quantity > 0),
  note text check (note is null or char_length(note) <= 500),
  protocol_number text check (protocol_number is null or char_length(protocol_number) <= 40),
  status public.request_status not null default 'pending',
  decided_by uuid references public.members (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, member_id) references public.members (company_id, id),
  foreign key (company_id, leave_type_id) references public.leave_types (company_id, id),
  check (end_date >= start_date and end_date - start_date <= 366)
);

create index leave_requests_company_status on public.leave_requests (company_id, status);
create index leave_requests_member on public.leave_requests (member_id, start_date desc);

create trigger leave_types_updated_at before update on public.leave_types
  for each row execute function private.set_updated_at();
create trigger leave_balances_updated_at before update on public.leave_balances
  for each row execute function private.set_updated_at();
create trigger leave_requests_updated_at before update on public.leave_requests
  for each row execute function private.set_updated_at();

-- Italian defaults for every new company.
create function private.seed_leave_types()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.leave_types (company_id, code, name, unit, requires_approval, tracks_balance, requires_protocol)
  values
    (new.id, 'FERIE',    'Ferie',                 'days',  true,  true,  false),
    (new.id, 'ROL',      'Permessi ROL',          'hours', true,  true,  false),
    (new.id, 'EXFEST',   'Ex festività',          'hours', true,  true,  false),
    (new.id, 'L104',     'Permessi Legge 104',    'days',  true,  false, false),
    (new.id, 'MALATTIA', 'Malattia',              'days',  false, false, true),
    (new.id, 'STRAORD',  'Straordinario',         'hours', true,  false, false);
  return null;
end;
$$;

create trigger companies_seed_leave_types after insert on public.companies
  for each row execute function private.seed_leave_types();

create function private.leave_request_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t public.leave_types;
begin
  select * into t from public.leave_types where id = new.leave_type_id;
  if not found or not t.active then
    raise exception 'leave_type_inactive' using errcode = 'P0001';
  end if;
  if t.requires_protocol and coalesce(trim(new.protocol_number), '') = '' then
    raise exception 'protocol_required' using errcode = 'P0001';
  end if;
  new.status := case when t.requires_approval then 'pending'::public.request_status else 'approved' end;
  new.decided_by := null;
  new.decided_at := case when t.requires_approval then null else now() end;
  return new;
end;
$$;

create trigger leave_requests_before_insert before insert on public.leave_requests
  for each row execute function private.leave_request_before_insert();

create function public.decide_leave_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.leave_requests;
  me public.members;
begin
  select * into r from public.leave_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(r.company_id);
  if me.id = r.member_id
     or not (me.role in ('hr_admin', 'company_owner')
             or r.member_id in (select private.my_managed_member_ids())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;

  update public.leave_requests
  set status = case when p_approve then 'approved'::public.request_status else 'rejected' end,
      decided_by = me.id, decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = r.id;
end;
$$;

create function public.cancel_leave_request(p_request_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.leave_requests set status = 'cancelled'
  where id = p_request_id and status = 'pending'
    and member_id in (select private.my_member_ids());
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

create view public.leave_balance_summary
with (security_invoker = true)
as
select
  b.company_id,
  b.member_id,
  b.leave_type_id,
  t.code,
  t.unit,
  b.year,
  b.entitled,
  b.carried_over,
  coalesce(sum(r.quantity) filter (where r.status = 'approved'), 0) as used,
  coalesce(sum(r.quantity) filter (where r.status = 'pending'), 0) as pending,
  b.entitled + b.carried_over - coalesce(sum(r.quantity) filter (where r.status = 'approved'), 0) as remaining
from public.leave_balances b
join public.leave_types t on t.id = b.leave_type_id
left join public.leave_requests r
  on r.member_id = b.member_id
 and r.leave_type_id = b.leave_type_id
 and extract(year from r.start_date) = b.year
group by b.id, t.code, t.unit;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;

create policy leave_types_select on public.leave_types for select to authenticated
  using (company_id in (select private.my_company_ids()));
create policy leave_types_insert on public.leave_types for insert to authenticated
  with check (company_id in (select private.my_hr_company_ids()));
create policy leave_types_update on public.leave_types for update to authenticated
  using (company_id in (select private.my_hr_company_ids()))
  with check (company_id in (select private.my_hr_company_ids()));

create policy leave_balances_select on public.leave_balances for select to authenticated
  using (
    member_id in (select private.my_member_ids())
    or member_id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );
create policy leave_balances_insert on public.leave_balances for insert to authenticated
  with check (company_id in (select private.my_hr_company_ids()));
create policy leave_balances_update on public.leave_balances for update to authenticated
  using (company_id in (select private.my_hr_company_ids()))
  with check (company_id in (select private.my_hr_company_ids()));

create policy leave_requests_select on public.leave_requests for select to authenticated
  using (
    member_id in (select private.my_member_ids())
    or member_id in (select private.my_managed_member_ids())
    or company_id in (select private.my_hr_company_ids())
  );
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check (
    member_id in (select private.my_member_ids())
    and company_id in (select private.my_company_ids())
  );

revoke all on public.leave_types, public.leave_balances, public.leave_requests,
  public.leave_balance_summary from anon, authenticated;

grant select on public.leave_types to authenticated;
grant insert (company_id, code, name, unit, requires_approval, tracks_balance, requires_protocol, active)
  on public.leave_types to authenticated;
grant update (name, requires_approval, tracks_balance, requires_protocol, active)
  on public.leave_types to authenticated;

grant select on public.leave_balances to authenticated;
grant insert (company_id, member_id, leave_type_id, year, entitled, carried_over, note)
  on public.leave_balances to authenticated;
grant update (entitled, carried_over, note) on public.leave_balances to authenticated;

grant select on public.leave_requests to authenticated;
grant insert (company_id, member_id, leave_type_id, start_date, end_date, quantity, note, protocol_number)
  on public.leave_requests to authenticated;

grant select on public.leave_balance_summary to authenticated;
