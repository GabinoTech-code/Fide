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

-- v1 created this in public; v2 only uses gen_random_uuid() (core) and pgcrypto.
drop extension if exists "uuid-ossp";
