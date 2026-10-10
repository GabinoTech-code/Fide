-- Push is an independent channel: e-mail failures never retry successful push.
-- Tokens are capabilities. Only the owner can read/delete them; registration
-- binds them to an authenticated membership and its live device key.
alter table public.push_tokens add column device_key_id uuid references public.device_keys(id) on delete cascade;
delete from public.push_tokens; -- legacy diagnostic tokens have no device binding
alter table public.push_tokens alter column device_key_id set not null;
create unique index push_tokens_device on public.push_tokens(device_key_id);
revoke insert, update on public.push_tokens from authenticated;
revoke insert(expo_push_token, platform), update(last_seen_at) on public.push_tokens from authenticated;

create function public.register_push_token(p_device_key_id uuid, p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1 from public.device_keys k join public.members m on m.id = k.member_id and m.company_id = k.company_id
    where k.id = p_device_key_id and k.status = 'active' and m.status = 'active' and m.auth_user_id = v_user
  ) then raise exception 'active_device_required' using errcode = '42501'; end if;
  -- Do not let knowledge of somebody else's token transfer ownership.
  if exists (select 1 from public.push_tokens where expo_push_token = p_token
             and (auth_user_id <> v_user or device_key_id <> p_device_key_id)) then
    raise exception 'token_unavailable' using errcode = '42501';
  end if;
  insert into public.push_tokens(auth_user_id, device_key_id, expo_push_token, platform)
  values(v_user, p_device_key_id, p_token, p_platform)
  on conflict(device_key_id) do update set expo_push_token = excluded.expo_push_token,
    platform = excluded.platform, last_seen_at = now();
end;
$$;

create function public.unregister_push_token(p_device_key_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens where device_key_id = p_device_key_id and auth_user_id = auth.uid();
$$;

create table private.push_outbox (
  id bigint generated always as identity primary key,
  token_id uuid not null references public.push_tokens(id) on delete cascade,
  recipient_member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts integer not null default 0,
  ticket_id text,
  accepted_at timestamptz,
  finished_at timestamptz,
  last_error text
);
create index push_outbox_pending on private.push_outbox(id) where finished_at is null;
alter table private.push_outbox enable row level security;
revoke all on private.push_outbox from public, anon, authenticated;

create function private.enqueue_push() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.push_outbox(token_id, recipient_member_id)
  select p.id, m.id from public.members m
    join public.device_keys k on k.member_id = m.id and k.company_id = m.company_id and k.status = 'active'
    join public.push_tokens p on p.device_key_id = k.id and p.auth_user_id = m.auth_user_id
  where m.id = new.recipient_member_id and m.company_id = new.company_id and m.status = 'active'
    and p.last_seen_at > now() - interval '30 days';
  return new;
end;
$$;
create trigger notification_push after insert on private.notification_outbox
for each row execute function private.enqueue_push();

-- Revocation/suspension/termination erase capabilities and queued deliveries.
create function private.prune_device_push() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' then delete from public.push_tokens where device_key_id = new.id; end if;
  return new;
end;
$$;
create trigger device_push_revoked after update of status on public.device_keys
for each row execute function private.prune_device_push();
create function private.prune_member_push() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' or new.auth_user_id is distinct from old.auth_user_id then
    delete from public.push_tokens p using public.device_keys k where p.device_key_id = k.id and k.member_id = new.id;
  end if;
  return new;
end;
$$;
create trigger member_push_disabled after update of status, auth_user_id on public.members
for each row execute function private.prune_member_push();

create function public.svc_push_claim(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ids bigint[]; v_rows jsonb;
begin
  delete from public.push_tokens where last_seen_at <= now() - interval '30 days';
  delete from private.push_outbox where created_at <= now() - interval '30 days';
  update private.push_outbox set finished_at = now(), last_error = 'send_expired'
    where finished_at is null and ticket_id is null and created_at <= now() - interval '24 hours';
  update private.push_outbox set finished_at = now(), last_error = 'receipt_expired'
    where finished_at is null and ticket_id is not null and accepted_at < now() - interval '24 hours';
  with picked as (
    select o.id from private.push_outbox o where o.finished_at is null
      and ((o.ticket_id is null and o.attempts < 5 and o.created_at > now() - interval '24 hours')
           or (o.ticket_id is not null and o.accepted_at <= now() - interval '15 minutes'))
      and (o.claimed_at is null or o.claimed_at <= now() - interval '5 minutes')
    order by o.id limit least(greatest(p_limit, 1), 100) for update skip locked
  ), claimed as (
    update private.push_outbox o set claimed_at = now(), attempts = attempts + case when ticket_id is null then 1 else 0 end
    from picked where o.id = picked.id returning o.id
  ) select coalesce(array_agg(id), '{}') into v_ids from claimed;
  -- Recheck live dependencies at dispatch, not just at enqueue/registration.
  update private.push_outbox o set finished_at = now(), last_error = 'no_recipient'
  where o.id = any(v_ids) and not exists (
    select 1 from public.push_tokens p join public.device_keys k on k.id = p.device_key_id
    join public.members m on m.id = k.member_id and m.company_id = k.company_id
    where p.id = o.token_id and m.id = o.recipient_member_id and m.auth_user_id = p.auth_user_id
      and m.status = 'active' and k.status = 'active'
  );
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'token', p.expo_push_token,
    'language', m.preferred_language, 'ticket', o.ticket_id) order by o.id), '[]') into v_rows
  from private.push_outbox o join public.push_tokens p on p.id = o.token_id
  join public.members m on m.id = o.recipient_member_id
  where o.id = any(v_ids) and o.finished_at is null;
  return v_rows;
end;
$$;

create function public.svc_push_done(p_id bigint, p_ticket text default null,
  p_error text default null, p_finished boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_error = 'DeviceNotRegistered' then
    delete from public.push_tokens where id = (select token_id from private.push_outbox where id = p_id);
    return;
  end if;
  update private.push_outbox set ticket_id = coalesce(p_ticket, ticket_id),
    accepted_at = case when p_ticket is not null and ticket_id is null then now() else accepted_at end,
    finished_at = case when p_finished then now() else finished_at end,
    last_error = left(p_error, 80), claimed_at = case when p_error = 'receipt_pending' then now() else null end
  where id = p_id;
end;
$$;

-- Preserve the established scheduler and Vault token, but wake it for either channel.
create or replace function private.dispatch_notifications()
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text; v_token text;
begin
  delete from private.notification_outbox where created_at < now() - interval '30 days'
    and (sent_at is not null or attempts >= 5);
  delete from public.push_tokens where last_seen_at <= now() - interval '30 days';
  delete from private.push_outbox where created_at <= now() - interval '30 days';
  if not exists (select 1 from private.notification_outbox where sent_at is null and attempts < 5
      and (claimed_at is null or claimed_at < now() - interval '5 minutes'))
    and not exists (select 1 from private.push_outbox where finished_at is null
      and (ticket_id is not null or (attempts < 5 and created_at > now() - interval '24 hours'))
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')) then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'fide_notify_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'fide_notify_token';
  if v_url is null or v_token is null then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-fide-dispatch-token', v_token),
    timeout_milliseconds := 15000);
end;
$$;

revoke all on function public.register_push_token(uuid,text,text), public.unregister_push_token(uuid),
  public.svc_push_claim(integer), public.svc_push_done(bigint,text,text,boolean),
  private.enqueue_push(), private.prune_device_push(), private.prune_member_push() from public, anon, authenticated;
grant execute on function public.register_push_token(uuid,text,text), public.unregister_push_token(uuid) to authenticated;
grant execute on function public.svc_push_claim(integer), public.svc_push_done(bigint,text,text,boolean) to service_role;
