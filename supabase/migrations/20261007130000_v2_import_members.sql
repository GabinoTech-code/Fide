-- Bulk employee import (portal CSV).
--
-- All-or-nothing: one bad row rolls back the whole file, so a half-imported
-- spreadsheet never leaves duplicates behind when HR fixes it and retries. The
-- error names the failing row (1-based, in p_rows order) and the reason, never
-- the row's values:
--   import_row_failed, DETAIL {"row": 3, "sqlstate": "23505", "constraint": "member_identities_cf"}
-- Each row goes through add_member(), so validation, normalisation and the
-- audit trail are exactly those of a single insert. Imported people are always
-- plain employees: roles are granted one by one in the portal.

create function public.import_members(p_company_id uuid, p_rows jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  r jsonb;
  i integer := 0;
  v_state text;
  v_constraint text;
begin
  perform private.require_member(p_company_id, '{hr_admin,company_owner}');
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      perform public.add_member(
        p_company_id,
        r ->> 'full_name',
        r ->> 'email',
        r ->> 'codice_fiscale',
        nullif(r ->> 'site_id', '')::uuid,
        null,
        r ->> 'employee_number'
      );
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_constraint = constraint_name;
      raise exception 'import_row_failed' using
        errcode = 'P0001',
        detail = jsonb_build_object('row', i, 'sqlstate', v_state, 'constraint', nullif(v_constraint, ''))::text;
    end;
  end loop;

  return i;
end;
$$;

revoke execute on function public.import_members(uuid, jsonb) from public, anon;
grant execute on function public.import_members(uuid, jsonb) to authenticated;
