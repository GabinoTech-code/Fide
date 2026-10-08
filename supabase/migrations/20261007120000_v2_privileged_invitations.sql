-- Fide v2 · security fix — privileged invitations.
--
-- Finding (security review, 2026-10-07): an hr_admin could take over a pending
-- invitation of an invited hr_admin/company_owner member:
--   1. update member_identities.email of that member to a mailbox they control,
--   2. call create_invitation() (it only checked that the caller is HR),
--   3. redeem the token with a fresh OTP login → company_owner.
-- That bypassed the rule enforced by add_member()/set_member_role(): only an
-- owner grants HR or owner powers.
--
-- Fix, two layers:
--   * create_invitation(): inviting an hr_admin/company_owner member requires an owner.
--   * member_identities: HR may edit identities of employees and managers only;
--     identities of HR/owner members are editable by owners.

create or replace function public.create_invitation(p_member_id uuid)
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

  if target.role in ('hr_admin', 'company_owner') and me.role <> 'company_owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
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

-- True when the caller may edit this member's identity (e-mail, codice fiscale).
create function private.can_edit_identity(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members target
    join public.members me
      on me.company_id = target.company_id
     and me.auth_user_id = (select auth.uid())
     and me.status = 'active'
    where target.id = p_member_id
      and (
        me.role = 'company_owner'
        or (me.role = 'hr_admin' and target.role in ('employee', 'manager'))
      )
  );
$$;

drop policy member_identities_update on public.member_identities;
create policy member_identities_update on public.member_identities for update to authenticated
  using (private.can_edit_identity(member_id))
  with check (private.can_edit_identity(member_id));

revoke execute on function private.can_edit_identity(uuid) from public, anon;
grant execute on function private.can_edit_identity(uuid) to authenticated, service_role;
revoke execute on function public.create_invitation(uuid) from public, anon;
grant execute on function public.create_invitation(uuid) to authenticated;
