-- Fide local seed (supabase db reset). Two companies so tenant isolation is
-- visible in development and testable (app/packages/db-tests).
--
-- Every login uses e-mail OTP; locally the codes show up in Inbucket
-- (http://localhost:54324). Fixed UUIDs (the suffix identifies the person):
--
--   Officine Aurora S.r.l.            a0000000-…-000000000001
--     a1…01 Mario Rossi      company_owner   mario.rossi@aurora.test
--     a1…02 Giulia Bianchi   hr_admin        giulia.bianchi@aurora.test
--     a1…03 Luca Verdi       manager         luca.verdi@aurora.test
--     a1…04 Marco Colombo    employee (→ Luca)  marco.colombo@aurora.test
--     a1…05 Anna Galli       employee (→ Luca)  anna.galli@aurora.test
--     a1…06 Paolo Marino     invited, login exists but not linked yet
--   Trattoria Bellavista S.n.c.       b0000000-…-000000000001
--     b1…01 Francesca Romano company_owner   francesca.romano@bellavista.test
--     b1…02 Sara Ferrari     employee        sara.ferrari@bellavista.test
--   No company
--     c1…01 founder@newco.test     allowlisted: may register a company
--     c1…02 stranger@nowhere.test  not allowlisted
--
-- auth user ids are a1…/b1…/c1…, member ids a2…/b2…, sites a3…/b3…,
-- kiosks a4…, device keys a5…/b5…

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
select
  '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email, '',
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('a1000000-0000-4000-8000-000000000001', 'mario.rossi@aurora.test'),
  ('a1000000-0000-4000-8000-000000000002', 'giulia.bianchi@aurora.test'),
  ('a1000000-0000-4000-8000-000000000003', 'luca.verdi@aurora.test'),
  ('a1000000-0000-4000-8000-000000000004', 'marco.colombo@aurora.test'),
  ('a1000000-0000-4000-8000-000000000005', 'anna.galli@aurora.test'),
  ('a1000000-0000-4000-8000-000000000006', 'paolo.marino@aurora.test'),
  ('b1000000-0000-4000-8000-000000000001', 'francesca.romano@bellavista.test'),
  ('b1000000-0000-4000-8000-000000000002', 'sara.ferrari@bellavista.test'),
  ('c1000000-0000-4000-8000-000000000001', 'founder@newco.test'),
  ('c1000000-0000-4000-8000-000000000002', 'stranger@nowhere.test')
) as u (id, email);

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
from auth.users u
where u.email like '%.test';

insert into private.signup_allowlist (email, note) values
  ('mario.rossi@aurora.test', 'seed'),
  ('francesca.romano@bellavista.test', 'seed'),
  ('founder@newco.test', 'seed');

-- Companies (the insert trigger adds the Italian leave types).
insert into public.companies (id, legal_name, vat_number, pec, sdi_code, ccnl, address) values
  ('a0000000-0000-4000-8000-000000000001', 'Officine Aurora S.r.l.', '01234567897',
   'amministrazione@pec.aurora.test', 'M5UXCR1', 'CCNL Metalmeccanico Industria',
   'Via dell''Innovazione 42, 20126 Milano (MI)'),
  ('b0000000-0000-4000-8000-000000000001', 'Trattoria Bellavista S.n.c.', '12345678903',
   'bellavista@pec.bellavista.test', 'KRRH6B9', 'CCNL Turismo e Pubblici Esercizi',
   'Piazza del Duomo 1, 50122 Firenze (FI)');

insert into public.sites (id, company_id, name, address, latitude, longitude, radius_m, geo_enabled) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Sede Milano',
   'Via dell''Innovazione 42, Milano', 45.5048, 9.2094, 150, true),
  ('a3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Magazzino Sesto',
   'Viale Italia 300, Sesto San Giovanni', 45.5340, 9.2310, 200, false),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Sala e cucina',
   'Piazza del Duomo 1, Firenze', 43.7731, 11.2560, 80, false);

insert into public.members (id, company_id, auth_user_id, role, status, full_name, site_id) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'company_owner', 'active', 'Mario Rossi', null),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'hr_admin', 'active', 'Giulia Bianchi', 'a3000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'manager', 'active', 'Luca Verdi', 'a3000000-0000-4000-8000-000000000002'),
  ('a2000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'employee', 'active', 'Marco Colombo', 'a3000000-0000-4000-8000-000000000002'),
  ('a2000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'employee', 'active', 'Anna Galli', 'a3000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', null, 'employee', 'invited', 'Paolo Marino', 'a3000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'company_owner', 'active', 'Francesca Romano', null),
  ('b2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'employee', 'active', 'Sara Ferrari', 'b3000000-0000-4000-8000-000000000001');

update public.members set manager_member_id = 'a2000000-0000-4000-8000-000000000003'
where id in ('a2000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000005');

insert into public.member_identities (member_id, company_id, email, codice_fiscale)
select m.id, m.company_id, v.email, v.cf
from (values
  ('a2000000-0000-4000-8000-000000000001', 'mario.rossi@aurora.test', 'RSSMRA85T10A562S'),
  ('a2000000-0000-4000-8000-000000000002', 'giulia.bianchi@aurora.test', 'BNCGLI90A41F205H'),
  ('a2000000-0000-4000-8000-000000000003', 'luca.verdi@aurora.test', 'VRDLCU78C15H501E'),
  ('a2000000-0000-4000-8000-000000000004', 'marco.colombo@aurora.test', 'CLMMRC88M03D612C'),
  ('a2000000-0000-4000-8000-000000000005', 'anna.galli@aurora.test', 'GLLNNA95S48A944C'),
  ('a2000000-0000-4000-8000-000000000006', 'paolo.marino@aurora.test', 'MRNPLA80P10A794D'),
  ('b2000000-0000-4000-8000-000000000001', 'francesca.romano@bellavista.test', 'RMNFNC91H55L736O'),
  ('b2000000-0000-4000-8000-000000000002', 'sara.ferrari@bellavista.test', 'FRRSRA92E52L219O')
) as v (member_id, email, cf)
join public.members m on m.id = v.member_id::uuid;

-- Placeholder public keys (deterministic, not real key pairs). The app replaces
-- them with real device keys on first sign-in through register_device_key().
insert into public.device_keys (id, company_id, member_id, x25519_public_key, ed25519_public_key, device_label)
select v.id::uuid, m.company_id, m.id,
       encode(sha256(convert_to('seed-x25519-' || m.id, 'UTF8')), 'base64'),
       encode(sha256(convert_to('seed-ed25519-' || m.id, 'UTF8')), 'base64'),
       'seed device'
from (values
  ('a5000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000004'),
  ('a5000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000005'),
  ('b5000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002')
) as v (id, member_id)
join public.members m on m.id = v.member_id::uuid;

insert into public.key_events (company_id, member_id, device_key_id, kind, reason)
select company_id, member_id, id, 'registered', 'seed' from public.device_keys;

-- A paired kiosk at the QR-only warehouse.
insert into public.kiosk_devices (id, company_id, site_id, name, status, paired_at) values
  ('a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'a3000000-0000-4000-8000-000000000002', 'Ingresso magazzino', 'active', now());
insert into private.kiosk_secrets (kiosk_id, secret) values
  ('a4000000-0000-4000-8000-000000000001', sha256(convert_to('seed-kiosk-secret', 'UTF8')));

-- 2026 holiday balances for Aurora's employees.
insert into public.leave_balances (company_id, member_id, leave_type_id, year, entitled, carried_over)
select m.company_id, m.id, t.id, 2026,
       case t.code when 'FERIE' then 26 when 'ROL' then 72 else 32 end,
       case t.code when 'FERIE' then 4 else 0 end
from public.members m
join public.leave_types t on t.company_id = m.company_id and t.code in ('FERIE', 'ROL', 'EXFEST')
where m.company_id = 'a0000000-0000-4000-8000-000000000001' and m.role in ('employee', 'manager');
