-- Operational employment references, not a payroll engine or a signed contract.
create table public.employment_terms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  member_id uuid not null,
  effective_from date not null check (effective_from between '1900-01-01' and '2100-12-31'),
  job_title text not null check (char_length(trim(job_title)) between 1 and 200),
  category text check (category is null or char_length(category) <= 100),
  level text check (level is null or char_length(level) <= 100),
  contract_type text not null check (char_length(trim(contract_type)) between 1 and 100),
  ccnl_reference text check (ccnl_reference is null or char_length(ccnl_reference) <= 200),
  weekly_hours numeric(5,2) not null check (weekly_hours > 0 and weekly_hours <= 168),
  created_by uuid not null references public.members(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.members(id),
  foreign key (company_id, member_id) references public.members(company_id, id) on delete cascade
);
create unique index employment_terms_member_date on public.employment_terms(member_id, effective_from) where voided_at is null;
create index employment_terms_company on public.employment_terms(company_id);
create index employment_terms_creator on public.employment_terms(created_by);
create index employment_terms_voider on public.employment_terms(voided_by) where voided_by is not null;
alter table public.employment_terms enable row level security;
create policy employment_terms_select on public.employment_terms for select to authenticated
using (member_id in (select private.my_readable_member_ids()) or company_id in (select private.my_hr_company_ids()));
revoke all on public.employment_terms from anon, authenticated;
grant select on public.employment_terms to authenticated;
create trigger employment_terms_audit after insert or update or delete on public.employment_terms
for each row execute function private.audit_row();

create function public.add_employment_terms(
  p_member_id uuid, p_effective_from date, p_job_title text, p_category text,
  p_level text, p_contract_type text, p_ccnl_reference text, p_weekly_hours numeric,
  p_expected_latest_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.members; me public.members; latest public.employment_terms; result uuid;
begin
  select * into target from public.members where id = p_member_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  me := private.require_member(target.company_id, '{hr_admin,company_owner}');
  if target.role in ('hr_admin','company_owner') and me.role <> 'company_owner' and me.id <> target.id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target.status not in ('active','invited','suspended') then
    raise exception 'member_not_active' using errcode = 'P0001';
  end if;
  select * into latest from public.employment_terms where member_id = target.id and voided_at is null
  order by effective_from desc limit 1;
  if latest.id is distinct from p_expected_latest_id then raise exception 'employment_stale' using errcode = 'P0001'; end if;
  if latest.id is not null and (p_effective_from < latest.effective_from
    or p_effective_from < (now() at time zone 'Europe/Rome')::date) then
    raise exception 'employment_date_invalid' using errcode = '22023';
  end if;
  if latest.id is not null and p_effective_from = latest.effective_from then
    -- Correct today's or a future version by recording a replacement, never overwriting its fields.
    update public.employment_terms set voided_at = now(), voided_by = me.id where id = latest.id;
  end if;
  insert into public.employment_terms(company_id, member_id, effective_from, job_title, category, level,
    contract_type, ccnl_reference, weekly_hours, created_by)
  values (target.company_id, target.id, p_effective_from, trim(p_job_title), nullif(trim(p_category),''),
    nullif(trim(p_level),''), trim(p_contract_type), nullif(trim(p_ccnl_reference),''), p_weekly_hours, me.id)
  returning id into result;
  return result;
end; $$;

-- Only a version not yet effective may be withdrawn. History is not overwritten.
create function public.void_employment_terms(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare terms public.employment_terms; target public.members; me public.members;
begin
  select * into terms from public.employment_terms where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into target from public.members where id = terms.member_id for update;
  me := private.require_member(target.company_id, '{hr_admin,company_owner}');
  if target.role in ('hr_admin','company_owner') and me.role <> 'company_owner' and me.id <> target.id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target.status not in ('active','invited','suspended') then raise exception 'member_not_active' using errcode = 'P0001'; end if;
  select * into terms from public.employment_terms where id = p_id for update;
  if terms.voided_at is not null or terms.effective_from <= (now() at time zone 'Europe/Rome')::date then
    raise exception 'employment_not_future' using errcode = '22023';
  end if;
  update public.employment_terms set voided_at = now(), voided_by = me.id where id = p_id;
end; $$;
revoke execute on function public.add_employment_terms(uuid,date,text,text,text,text,text,numeric,uuid) from public, anon;
revoke execute on function public.void_employment_terms(uuid) from public, anon;
grant execute on function public.add_employment_terms(uuid,date,text,text,text,text,text,numeric,uuid), public.void_employment_terms(uuid) to authenticated;

-- Delete these operational references 12 months after termination, or on erasure.
-- This does not delete legally retained contracts/payroll documents.
create function private.purge_employment_terms() returns void language sql security definer set search_path = '' as $$
  delete from public.employment_terms t using public.members m where m.id = t.member_id
  and (m.status = 'erased' or (m.status = 'terminated' and m.terminated_on + interval '12 months' < (now() at time zone 'Europe/Rome')::date));
$$;
revoke execute on function private.purge_employment_terms() from public, anon, authenticated;
grant execute on function private.purge_employment_terms() to service_role;
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('fide-purge-employment-terms', '17 2 * * *', 'select private.purge_employment_terms()');
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.employment_terms;
  end if;
end; $$;

create or replace function public.export_my_data()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with mine as (select private.my_readable_member_ids() as id)
  select jsonb_build_object(
    'format', 'fide-export-v1', 'generated_at', now(),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.members m where m.id in (select id from mine)),
    'identities', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from public.member_identities i where i.member_id in (select id from mine)),
    'companies', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'legal_name', c.legal_name, 'vat_number', c.vat_number, 'pec', c.pec)), '[]') from public.companies c where c.id in (select company_id from public.members where id in (select id from mine))),
    'employment_terms', (select coalesce(jsonb_agg(to_jsonb(t) - 'created_by' - 'voided_by' order by t.effective_from), '[]') from public.employment_terms t where t.member_id in (select id from mine)),
    'device_keys', (select coalesce(jsonb_agg(to_jsonb(k)), '[]') from public.device_keys k where k.member_id in (select id from mine)),
    'key_events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.key_events e where e.member_id in (select id from mine)),
    'punches', (select coalesce(jsonb_agg(to_jsonb(p) order by p.device_ts), '[]') from public.punches p where p.member_id in (select id from mine)),
    'punch_corrections', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.punch_corrections c where c.member_id in (select id from mine)),
    'leave_requests', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.leave_requests r where r.member_id in (select id from mine)),
    'leave_balances', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.leave_balances b where b.member_id in (select id from mine)),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'title', d.title, 'period', d.period, 'status', d.status, 'published_at', d.published_at, 'first_opened_at', d.first_opened_at)), '[]') from public.documents d where d.member_id in (select id from mine)),
    'document_access_events', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.document_access_events a where a.member_id in (select id from mine)),
    'gdpr_requests', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from public.gdpr_requests g where g.member_id in (select id from mine))
  );
$$;
