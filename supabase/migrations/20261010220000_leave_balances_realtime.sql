-- Balances include leave used outside Fide, without counting its own requests twice.
alter table public.leave_balances add column used_external numeric(7, 2) not null default 0 check (used_external >= 0);
grant insert (used_external), update (used_external) on public.leave_balances to authenticated;

create or replace view public.leave_balance_summary
with (security_invoker = true)
as
select b.company_id, b.member_id, b.leave_type_id, t.code, t.unit, b.year,
  b.entitled, b.carried_over,
  coalesce(sum(r.quantity) filter (where r.status = 'approved'), 0) as used,
  coalesce(sum(r.quantity) filter (where r.status = 'pending'), 0) as pending,
  b.entitled + b.carried_over - b.used_external
    - coalesce(sum(r.quantity) filter (where r.status = 'approved'), 0) as remaining,
  b.used_external
from public.leave_balances b
join public.leave_types t on t.id = b.leave_type_id
left join public.leave_requests r on r.member_id = b.member_id
  and r.leave_type_id = b.leave_type_id and extract(year from r.start_date) = b.year
group by b.id, t.code, t.unit;

-- HR balance updates must refresh the employee's dashboard without a restart.
-- Realtime still applies the existing leave_balances SELECT policies.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_balances'
     ) then
    alter publication supabase_realtime add table public.leave_balances;
  end if;
end;
$$;
