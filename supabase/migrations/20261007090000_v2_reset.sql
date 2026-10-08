-- Fide v2 · 0/5 — Drop the v1 demo schema.
--
-- v1 (20261004_initial_schema_and_rls.sql) only ever held demo data and its RLS
-- policies were effectively open to the anon key. v2 replaces it entirely; see
-- docs/adr/0001-alcance-piloto-y-stack.md.

drop table if exists public.employee_invitations cascade;
drop table if exists public.encrypted_documents cascade;
drop table if exists public.attendance_punches cascade;
drop table if exists public.user_public_keys cascade;
drop table if exists public.users cascade;
drop table if exists public.company_sites cascade;
drop table if exists public.companies cascade;

-- v1 ran `create extension if not exists "uuid-ossp"`, which on Supabase is a
-- no-op: the platform installs it in the `extensions` schema and its own schemas
-- may depend on it. Only a copy in `public` is v1's to remove.
do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'uuid-ossp' and n.nspname = 'public'
  ) then
    drop extension "uuid-ossp";
  end if;
end;
$$;
