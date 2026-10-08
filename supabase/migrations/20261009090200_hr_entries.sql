-- Block 1 · F1 + V2 — HR records punches and absences on behalf of an employee.
--
-- The information notice and the DPIA promise a way to record attendance
-- without a personal phone, managed by HR (the employee cannot be forced to use
-- their own phone), and HR receives sick-leave certificates (INPS protocol)
-- directly. Both go through these RPCs:
--   * a reason is mandatory and the entry is marked `entered_by`: the employee
--     sees "recorded by HR" in the app and can contest it;
--   * nobody records entries for themselves (four eyes);
--   * the punch is `manual` and flagged `hr_entry`, never a signed punch.

alter table public.punch_corrections
  add column entered_by uuid references public.members (id);
alter table public.leave_requests
  add column entered_by uuid references public.members (id);

-- An entry may concern a former employee's last days (up to terminated_on).
create function private.require_hr_entry_target(p_member_id uuid, p_day date)
returns public.members
language plpgsql stable security definer
set search_path = ''
as $$
declare
  target public.members;
  me public.members;
begin
  select * into target from public.members where id = p_member_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(target.company_id, '{hr_admin,company_owner}');
  if me.id = target.id then
    raise exception 'self_entry' using errcode = '42501';
  end if;
  if not (target.status = 'active'
          or (target.status = 'terminated' and p_day <= target.terminated_on)) then
    raise exception 'member_not_active' using errcode = 'P0001';
  end if;
  return me;
end;
$$;

create function public.hr_record_punch(
  p_member_id uuid,
  p_punch_type public.punch_type,
  p_ts timestamptz,
  p_site_id uuid,
  p_reason text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.require_hr_entry_target(p_member_id, (p_ts at time zone 'Europe/Rome')::date);
  v_company uuid;
  v_correction uuid;
  v_punch uuid;
begin
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_ts > now() + interval '5 minutes' then
    raise exception 'ts_in_future' using errcode = '22023';
  end if;
  select company_id into v_company from public.members where id = p_member_id;

  insert into public.punch_corrections (
    company_id, member_id, punch_type, requested_ts, site_id, reason,
    status, decided_by, decided_at, entered_by)
  values (
    v_company, p_member_id, p_punch_type, p_ts, p_site_id, trim(p_reason),
    'approved', me.id, now(), me.id)
  returning id into v_correction;

  insert into public.punches (company_id, member_id, punch_type, method, site_id, device_ts,
                              receipt_code, flags, correction_id)
  values (v_company, p_member_id, p_punch_type, 'manual', p_site_id, p_ts,
          private.new_receipt_code(), '{hr_entry,manual_correction}', v_correction)
  returning id into v_punch;

  return v_punch;
end;
$$;

create function public.hr_record_leave(
  p_member_id uuid,
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_quantity numeric,
  p_note text,
  p_protocol_number text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me public.members := private.require_hr_entry_target(p_member_id, p_end_date);
  v_company uuid;
  v_id uuid;
begin
  if char_length(coalesce(trim(p_note), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select company_id into v_company from public.members where id = p_member_id;

  insert into public.leave_requests (
    company_id, member_id, leave_type_id, start_date, end_date, quantity, note, protocol_number, entered_by)
  values (
    v_company, p_member_id, p_leave_type_id, p_start_date, p_end_date, p_quantity,
    trim(p_note), nullif(trim(p_protocol_number), ''), me.id)
  returning id into v_id;

  return v_id;
end;
$$;

-- Requests filed by HR are approved at once by the person who filed them.
-- `entered_by` is not in the column grants, so only hr_record_leave() sets it.
create or replace function private.leave_request_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t public.leave_types;
begin
  select * into t from public.leave_types where id = new.leave_type_id and company_id = new.company_id;
  if not found or not t.active then
    raise exception 'leave_type_inactive' using errcode = 'P0001';
  end if;
  if t.requires_protocol and coalesce(trim(new.protocol_number), '') = '' then
    raise exception 'protocol_required' using errcode = 'P0001';
  end if;
  if new.entered_by is not null then
    new.status := 'approved';
    new.decided_by := new.entered_by;
    new.decided_at := now();
    return new;
  end if;
  new.status := case when t.requires_approval then 'pending'::public.request_status else 'approved' end;
  new.decided_by := null;
  new.decided_at := case when t.requires_approval then null else now() end;
  return new;
end;
$$;

revoke execute on function private.require_hr_entry_target(uuid, date) from public, anon, authenticated;
revoke execute on function public.hr_record_punch(uuid, public.punch_type, timestamptz, uuid, text) from public, anon;
revoke execute on function public.hr_record_leave(uuid, uuid, date, date, numeric, text, text) from public, anon;
grant execute on function public.hr_record_punch(uuid, public.punch_type, timestamptz, uuid, text) to authenticated;
grant execute on function public.hr_record_leave(uuid, uuid, date, date, numeric, text, text) to authenticated;
