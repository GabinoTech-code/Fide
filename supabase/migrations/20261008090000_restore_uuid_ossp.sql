-- The hosted project received v2 through the Supabase GitHub integration when
-- #1 was merged, i.e. with the first version of 20261007090000_v2_reset.sql,
-- which dropped "uuid-ossp" unconditionally. Supabase installs it in the
-- `extensions` schema by default; put it back. A no-op wherever it still exists
-- (local stacks, fresh projects). Fide itself only uses gen_random_uuid().
create extension if not exists "uuid-ossp" with schema extensions;
