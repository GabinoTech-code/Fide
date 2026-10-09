-- Block 2 · N1 — e-mail notifications.
--
-- Triggers put one row per recipient in private.notification_outbox; the
-- notify-dispatch Edge Function sends them through Brevo and marks them sent.
-- pg_cron calls it every minute, but only while something is pending.
--
-- Minimisation: the outbox stores who and what kind of event, never an e-mail
-- address or content. The address is read at send time, so a corrected e-mail
-- is used and an erased member gets nothing. The e-mails never say which kind
-- of absence was requested (a sick leave is health data) nor what a document
-- contains. Sent rows are deleted after 30 days.

create type public.notification_kind as enum (
  'leave_requested',      -- to HR and the employee's manager
  'correction_requested', -- to HR and the employee's manager
  'request_decided',      -- to the employee
  'gdpr_requested',       -- to HR only (not the manager)
  'gdpr_answered',        -- to the employee
  'document_published'    -- to the employee, once per batch
);

create table private.notification_outbox (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  recipient_member_id uuid not null references public.members (id) on delete cascade,
  kind public.notification_kind not null,
  -- The request, document batch or GDPR request the e-mail is about.
  ref_id uuid not null,
  -- Who the event is about (the requester), for HR e-mails.
  subject_member_id uuid references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 200)
);

create unique index notification_outbox_once on private.notification_outbox (recipient_member_id, kind, ref_id);
create index notification_outbox_pending on private.notification_outbox (id) where sent_at is null;

-- ---------------------------------------------------------------------------
-- Enqueue helpers
-- ---------------------------------------------------------------------------

-- HR and owners of the company (and, if asked, the requester's manager), never
-- the requester themselves.
create function private.notify_company(
  p_company_id uuid,
  p_subject_member_id uuid,
  p_kind public.notification_kind,
  p_ref_id uuid,
  p_include_manager boolean
)
returns void
language sql security definer
set search_path = ''
as $$
  insert into private.notification_outbox (company_id, recipient_member_id, kind, ref_id, subject_member_id)
  select m.company_id, m.id, p_kind, p_ref_id, p_subject_member_id
  from public.members m
  where m.company_id = p_company_id
    and m.status = 'active'
    and m.id <> p_subject_member_id
    and (m.role in ('hr_admin', 'company_owner')
         or (p_include_manager
             and m.id = (select s.manager_member_id from public.members s where s.id = p_subject_member_id)))
  on conflict do nothing;
$$;

create function private.notify_member(p_member_id uuid, p_kind public.notification_kind, p_ref_id uuid)
returns void
language sql security definer
set search_path = ''
as $$
  insert into private.notification_outbox (company_id, recipient_member_id, kind, ref_id)
  select m.company_id, m.id, p_kind, p_ref_id
  from public.members m
  where m.id = p_member_id and private.has_own_access(m.status, m.terminated_on)
  on conflict do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.notify_request_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_kind public.notification_kind :=
    case when tg_table_name = 'leave_requests' then 'leave_requested' else 'correction_requested' end;
begin
  if tg_op = 'INSERT' then
    -- Requests HR records itself are approved at once: nobody to tell.
    if new.status = 'pending' then
      perform private.notify_company(new.company_id, new.member_id, v_kind, new.id, true);
    end if;
  elsif old.status = 'pending' and new.status in ('approved', 'rejected')
        and new.decided_by is distinct from new.member_id then
    perform private.notify_member(new.member_id, 'request_decided', new.id);
  end if;
  return null;
end;
$$;

create trigger leave_requests_notify after insert or update of status on public.leave_requests
  for each row execute function private.notify_request_change();
create trigger punch_corrections_notify after insert or update of status on public.punch_corrections
  for each row execute function private.notify_request_change();

create function private.notify_gdpr_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify_company(new.company_id, new.member_id, 'gdpr_requested', new.id, false);
  elsif old.status not in ('completed', 'rejected') and new.status in ('completed', 'rejected') then
    perform private.notify_member(new.member_id, 'gdpr_answered', new.id);
  end if;
  return null;
end;
$$;

create trigger gdpr_requests_notify after insert or update of status on public.gdpr_requests
  for each row execute function private.notify_gdpr_change();

create function private.notify_document_published()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'published' then
    -- One e-mail per person per batch, however many documents it holds.
    perform private.notify_member(new.member_id, 'document_published', coalesce(new.batch_id, new.id));
  end if;
  return null;
end;
$$;

create trigger documents_notify after update of status on public.documents
  for each row execute function private.notify_document_published();

-- ---------------------------------------------------------------------------
-- service_role: the dispatcher claims a batch and reports each result
-- ---------------------------------------------------------------------------

-- Claims up to p_limit pending rows (not claimed in the last 5 minutes, fewer
-- than 5 attempts) and returns what the e-mail needs. Rows whose recipient has
-- no e-mail or no access any more are closed here and not returned.
create function public.svc_notification_claim(p_limit integer default 50)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
  v_rows jsonb;
begin
  -- 1. Claim (one statement per change: a row cannot be updated twice in one).
  with picked as (
    select o.id
    from private.notification_outbox o
    where o.sent_at is null and o.attempts < 5
      and (o.claimed_at is null or o.claimed_at < now() - interval '5 minutes')
    order by o.id
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  ),
  claimed as (
    update private.notification_outbox o
    set claimed_at = now(), attempts = o.attempts + 1
    from picked
    where o.id = picked.id
    returning o.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from claimed;

  -- 2. Close the rows nobody can receive any more (no e-mail, suspended, erased,
  --    or a former employee past the 12-month window).
  update private.notification_outbox o
  set sent_at = now(), last_error = 'no_recipient', claimed_at = null
  from public.members r
  left join public.member_identities i on i.member_id = r.id
  where o.id = any (v_ids)
    and r.id = o.recipient_member_id
    and (i.email is null or not private.has_own_access(r.status, r.terminated_on));

  -- 3. What the e-mails need.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'kind', o.kind, 'email', i.email, 'recipient_name', r.full_name,
           'language', r.preferred_language, 'company', co.legal_name, 'subject_name', s.full_name,
           'extra', case o.kind
                      when 'gdpr_requested' then (select g.due_at::text from public.gdpr_requests g where g.id = o.ref_id)
                      when 'document_published' then (select b.kind::text from public.payroll_batches b where b.id = o.ref_id)
                    end)
           order by o.id), '[]')
  into v_rows
  from private.notification_outbox o
  join public.members r on r.id = o.recipient_member_id
  join public.companies co on co.id = o.company_id
  join public.member_identities i on i.member_id = r.id
  left join public.members s on s.id = o.subject_member_id
  where o.id = any (v_ids) and o.sent_at is null;
  return v_rows;
end;
$$;

-- p_error null = sent. Otherwise the row stays pending for a retry (up to 5 attempts).
create function public.svc_notification_done(p_id bigint, p_error text default null)
returns void
language sql security definer
set search_path = ''
as $$
  update private.notification_outbox
  set sent_at = case when p_error is null then now() end,
      last_error = left(p_error, 200),
      claimed_at = null
  where id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Scheduling (hosted project and `supabase start`; skipped where pg_cron,
-- pg_net or Vault are missing, e.g. the PGlite tests)
-- ---------------------------------------------------------------------------

-- Every minute: purge old rows and, only if something is pending, call the
-- dispatcher with the URL and token kept in Vault (set by supabase-deploy).
create function private.dispatch_notifications()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  delete from private.notification_outbox
  where created_at < now() - interval '30 days' and (sent_at is not null or attempts >= 5);

  if not exists (
    select 1 from private.notification_outbox
    where sent_at is null and attempts < 5
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'fide_notify_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'fide_notify_token';
  if v_url is null or v_token is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-fide-dispatch-token', v_token),
    timeout_milliseconds := 15000);
end;
$$;

-- Called by the supabase-deploy workflow (Management API, as postgres) with
-- the dispatcher URL and a token it rotates on every deploy.
create function private.set_notify_config(p_url text, p_token text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text;
  v_value text;
  v_id uuid;
begin
  foreach v_name in array array['fide_notify_url', 'fide_notify_token'] loop
    v_value := case v_name when 'fide_notify_url' then p_url else p_token end;
    select id into v_id from vault.secrets where name = v_name;
    if v_id is null then
      perform vault.create_secret(v_value, v_name, 'Fide notify-dispatch');
    else
      perform vault.update_secret(v_id, v_value);
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('fide-notify-dispatch', '* * * * *', 'select private.dispatch_notifications()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: nothing here is reachable by clients
-- ---------------------------------------------------------------------------

revoke all on private.notification_outbox from public, anon, authenticated;
revoke execute on function private.notify_company(uuid, uuid, public.notification_kind, uuid, boolean) from public, anon, authenticated;
revoke execute on function private.notify_member(uuid, public.notification_kind, uuid) from public, anon, authenticated;
revoke execute on function private.notify_request_change() from public, anon, authenticated;
revoke execute on function private.notify_gdpr_change() from public, anon, authenticated;
revoke execute on function private.notify_document_published() from public, anon, authenticated;
revoke execute on function private.dispatch_notifications() from public, anon, authenticated;
revoke execute on function private.set_notify_config(text, text) from public, anon, authenticated;
revoke execute on function public.svc_notification_claim(integer) from public, anon, authenticated;
revoke execute on function public.svc_notification_done(bigint, text) from public, anon, authenticated;
grant execute on function public.svc_notification_claim(integer) to service_role;
grant execute on function public.svc_notification_done(bigint, text) to service_role;
