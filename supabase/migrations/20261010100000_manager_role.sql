-- Team managers ("capo turno") get real powers only through their role.
--
-- Before: the right to read a team and approve its requests came from being
-- someone's manager_member_id, whatever one's role; picking an ordinary
-- employee as "Responsabile" silently made them an approver. Now:
--
-- * a manager_member_id must point to an active member of the same company
--   with an approving role (manager, hr_admin or company_owner), whichever
--   path writes it (add_member, update_member, CSV import): a trigger checks;
-- * my_managed_member_ids() also requires that role, so the rights follow the
--   role even for rows written before this migration;
-- * taking the approving role away leaves the team without a manager instead
--   of keeping stale links. A suspended or former manager approves nothing
--   (the helper requires an active member) but keeps the team for a return.

create or replace function private.my_managed_member_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select e.id
  from public.members e
  join public.members mgr on mgr.id = e.manager_member_id and mgr.company_id = e.company_id
  where mgr.auth_user_id = (select auth.uid())
    and mgr.status = 'active'
    and mgr.role in ('manager', 'hr_admin', 'company_owner');
$$;

create function private.check_manager_role()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Checked when the manager is set or changed, not on unrelated edits.
  if new.manager_member_id is null
     or (tg_op = 'UPDATE' and new.manager_member_id is not distinct from old.manager_member_id) then
    return new;
  end if;
  if new.manager_member_id = new.id or not exists (
    select 1 from public.members m
    where m.id = new.manager_member_id
      and m.company_id = new.company_id
      and m.status = 'active'
      and m.role in ('manager', 'hr_admin', 'company_owner')
  ) then
    raise exception 'manager_invalid' using errcode = '22023',
      hint = 'The manager must be an active manager, HR admin or owner of the same company.';
  end if;
  return new;
end;
$$;

create trigger members_manager_role
before insert or update of manager_member_id on public.members
for each row execute function private.check_manager_role();

-- A member who loses the approving role leaves their team unassigned.
create function private.release_team()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.role not in ('manager', 'hr_admin', 'company_owner')
     and old.role in ('manager', 'hr_admin', 'company_owner') then
    update public.members set manager_member_id = null where manager_member_id = new.id;
  end if;
  return new;
end;
$$;

create trigger members_release_team
after update of role on public.members
for each row execute function private.release_team();

revoke all on function private.check_manager_role() from public, anon, authenticated;
revoke all on function private.release_team() from public, anon, authenticated;

-- update_member checked the manager itself on every save, even when it did not
-- change (editing the name of someone whose manager is suspended failed). The
-- trigger above is now the one check, on every write path. Same signature and
-- grants; the body is the 20261009090100 one without that block.
create or replace function public.update_member(
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
  -- The manager is checked by the members_manager_role trigger, only when it changes.

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
