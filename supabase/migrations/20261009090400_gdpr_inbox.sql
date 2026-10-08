-- Block 1 · G1 — the HR inbox for GDPR requests (art. 12, 15–22).
--
-- * Every request has a deadline: one month from receipt, extendable once by
--   two more months with a reason (art. 12.3).
-- * Closing a request (completed / rejected) needs a written answer: the
--   employee reads it in the app. A rejection states the legal basis, e.g.
--   art. 17.3.b for attendance records and payslips the employer must keep.
-- * For a former employee, erasure can remove at once what no law requires the
--   company to keep: the phone's keys and push tokens. Records under a legal
--   retention period are purged when it ends (block 3, G2).
-- (Note: 20261007090500 mentions a "gdpr-erasure" Edge Function; it was never
-- written. Erasure works as described here.)

alter table public.gdpr_requests
  add column due_at timestamptz,
  add column extended_at timestamptz,
  add column extension_note text check (extension_note is null or char_length(extension_note) between 3 and 2000);

update public.gdpr_requests set due_at = created_at + interval '1 month' where due_at is null;
alter table public.gdpr_requests alter column due_at set not null;

create function private.gdpr_request_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := 'pending';
  new.created_at := now();
  new.due_at := now() + interval '1 month';
  new.extended_at := null;
  new.extension_note := null;
  return new;
end;
$$;

create trigger gdpr_requests_before_insert before insert on public.gdpr_requests
  for each row execute function private.gdpr_request_before_insert();

create or replace function public.resolve_gdpr_request(p_request_id uuid, p_status public.gdpr_status, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.gdpr_requests;
  me public.members;
begin
  select * into r from public.gdpr_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(r.company_id, '{hr_admin,company_owner}');
  if p_status = 'pending' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if r.status in ('completed', 'rejected') then
    raise exception 'already_resolved' using errcode = 'P0001';
  end if;
  if p_status in ('completed', 'rejected') and char_length(coalesce(trim(p_note), '')) < 3 then
    raise exception 'answer_required' using errcode = '22023';
  end if;
  update public.gdpr_requests
  set status = p_status,
      resolution_note = coalesce(nullif(trim(p_note), ''), resolution_note),
      resolved_by = case when p_status in ('completed', 'rejected') then me.id end,
      resolved_at = case when p_status in ('completed', 'rejected') then now() end
  where id = r.id;
end;
$$;

create function public.extend_gdpr_request(p_request_id uuid, p_note text)
returns timestamptz
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.gdpr_requests;
  v_due timestamptz;
begin
  select * into r from public.gdpr_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_member(r.company_id, '{hr_admin,company_owner}');
  if r.status in ('completed', 'rejected') then
    raise exception 'already_resolved' using errcode = 'P0001';
  end if;
  if r.extended_at is not null then
    raise exception 'already_extended' using errcode = 'P0001';
  end if;
  -- The employee must be told within the first month (art. 12.3).
  if now() > r.due_at then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  if char_length(coalesce(trim(p_note), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  v_due := r.created_at + interval '3 months';
  update public.gdpr_requests
  set due_at = v_due, extended_at = now(), extension_note = trim(p_note),
      status = case when status = 'pending' then 'in_progress'::public.gdpr_status else status end
  where id = r.id;
  return v_due;
end;
$$;

-- Erasure for a former employee: revoke the phone's keys (their documents can
-- no longer be decrypted) and delete push tokens, unless the same login still
-- works for another company in Fide. Closes the request with the answer.
create function public.gdpr_erase_former_member(p_request_id uuid, p_note text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.gdpr_requests;
  me public.members;
  target public.members;
  v_keys int := 0;
  v_tokens int := 0;
  k uuid;
begin
  select * into r from public.gdpr_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(r.company_id, '{hr_admin,company_owner}');
  if r.kind <> 'erasure' then
    raise exception 'not_erasure' using errcode = 'P0001';
  end if;
  if r.status in ('completed', 'rejected') then
    raise exception 'already_resolved' using errcode = 'P0001';
  end if;
  if char_length(coalesce(trim(p_note), '')) < 3 then
    raise exception 'answer_required' using errcode = '22023';
  end if;
  select * into target from public.members where id = r.member_id for update;
  if target.status <> 'terminated' then
    raise exception 'member_not_terminated' using errcode = 'P0001';
  end if;

  for k in select id from public.device_keys where member_id = target.id and status = 'active' for update loop
    update public.device_keys set status = 'revoked', revoked_at = now() where id = k;
    insert into public.key_events (company_id, member_id, device_key_id, kind, reason, actor_member_id)
    values (target.company_id, target.id, k, 'revoked', 'gdpr_erasure', me.id);
    v_keys := v_keys + 1;
  end loop;

  if target.auth_user_id is not null and not exists (
    select 1 from public.members other
    where other.auth_user_id = target.auth_user_id and other.id <> target.id
      and private.has_own_access(other.status, other.terminated_on)
  ) then
    delete from public.push_tokens where auth_user_id = target.auth_user_id;
    get diagnostics v_tokens = row_count;
  end if;

  update public.gdpr_requests
  set status = 'completed', resolution_note = trim(p_note), resolved_by = me.id, resolved_at = now()
  where id = r.id;

  return jsonb_build_object('revoked_keys', v_keys, 'deleted_push_tokens', v_tokens);
end;
$$;

revoke execute on function private.gdpr_request_before_insert() from public, anon, authenticated;
revoke execute on function public.extend_gdpr_request(uuid, text) from public, anon;
revoke execute on function public.gdpr_erase_former_member(uuid, text) from public, anon;
grant execute on function public.extend_gdpr_request(uuid, text) to authenticated;
grant execute on function public.gdpr_erase_former_member(uuid, text) to authenticated;
