-- Block 1 · D1 — withdraw a document sent to the wrong person (or by mistake).
--
-- withdraw_document():
--   * marks the document `deleted` and logs who, when and why (append-only event);
--   * deletes its key wrap: the file key was sealed only for the recipient's
--     device, so without the wrap nobody can decrypt it any more, even with the
--     ciphertext;
--   * returns whether the recipient had already downloaded or opened it. If so
--     the wrong person may have read it: a personal data breach the company
--     (controller) must assess and, if there is a risk, notify to the Garante
--     within 72 hours (art. 33 GDPR). The portal says so.
-- The portal then removes the ciphertext from Storage (policy below).

alter table public.documents
  add column withdrawn_at timestamptz,
  add column withdrawn_by uuid references public.members (id),
  add column withdrawal_reason text check (withdrawal_reason is null or char_length(withdrawal_reason) between 3 and 500),
  add constraint documents_withdrawal check ((status = 'deleted') = (withdrawn_at is not null));

create function public.withdraw_document(p_document_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  d public.documents;
  me public.members;
  v_downloaded boolean;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  me := private.require_member(d.company_id, '{hr_admin,company_owner}');
  if d.status = 'deleted' then
    raise exception 'already_withdrawn' using errcode = 'P0001';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.document_access_events
    where document_id = d.id and event in ('downloaded', 'opened')
  ) into v_downloaded;

  update public.documents
  set status = 'deleted', withdrawn_at = now(), withdrawn_by = me.id, withdrawal_reason = trim(p_reason)
  where id = d.id;

  delete from public.document_key_wraps where document_id = d.id;

  insert into public.document_access_events (company_id, document_id, member_id, actor_member_id, event)
  values (d.company_id, d.id, d.member_id, me.id, 'deleted');

  return jsonb_build_object(
    'storage_path', d.storage_path,
    'was_published', d.status in ('published', 'superseded'),
    'downloaded', v_downloaded,
    'first_opened_at', d.first_opened_at);
end;
$$;

revoke execute on function public.withdraw_document(uuid, text) from public, anon;
grant execute on function public.withdraw_document(uuid, text) to authenticated;

-- HR may remove the ciphertext of a withdrawn document of their company, and
-- only that: published documents still cannot be removed or read by clients.
-- (Storage's remove() needs SELECT and DELETE on the object.)
create policy encrypted_documents_hr_remove_withdrawn on storage.objects for delete to authenticated
  using (
    bucket_id = 'encrypted-documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = name
        and d.status = 'deleted'
        and d.company_id in (select private.my_hr_company_ids())
    )
  );
create policy encrypted_documents_hr_select_withdrawn on storage.objects for select to authenticated
  using (
    bucket_id = 'encrypted-documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = name
        and d.status = 'deleted'
        and d.company_id in (select private.my_hr_company_ids())
    )
  );
