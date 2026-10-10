-- Invitation preview for the app's welcome screen, before the employee signs
-- in: "Invito ricevuto · Aurora S.r.l. · Dipendente · Milano" (as in the design
-- prototype). It is the only function anon may execute, and deliberately so:
--
-- * the 43-character token (32 random bytes) is the secret e-mailed to the
--   invitee; holding it already proves having the invitation;
-- * the answer is what that e-mail says: company, role and site. No e-mail
--   address, name or id of anyone;
-- * nothing for a malformed, unknown, expired, revoked or used token, and the
--   same empty answer in every case;
-- * redeeming still requires signing in with the invited e-mail.
create function public.invitation_preview(p_token text)
returns table (company_name text, role public.member_role, site_name text, expires_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select c.legal_name, m.role, s.name, i.expires_at
  from public.invitations i
  join public.companies c on c.id = i.company_id
  join public.members m on m.id = i.member_id and m.company_id = i.company_id
  left join public.sites s on s.id = m.site_id
  where p_token ~ '^[A-Za-z0-9_-]{43}$'
    and i.token_hash = sha256(convert_to(p_token, 'UTF8'))
    and i.status = 'pending'
    and i.expires_at > now()
    and m.status = 'invited';
$$;

revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;
