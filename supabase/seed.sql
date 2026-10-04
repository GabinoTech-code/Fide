-- ============================================================================
-- FIDE SUPABASE SEED DATA (INITIAL ORGANIZATION & SITE)
-- ============================================================================

-- 1. Insert Default Company
INSERT INTO public.companies (
    id,
    legal_name,
    country,
    tax_id,
    fiscal_code,
    pec_email,
    sdi_code,
    collective_agreement,
    headquarters_address,
    public_key_fingerprint
) VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Officine Aurora S.r.l.',
    'IT',
    'IT09876543210',
    '09876543210',
    'amministrazione@pec.aurora.it',
    'M5UXCR1',
    'CCNL Metalmeccanico Industria',
    'Via dell''Innovazione 42, 20126 Milano (MI)',
    '7F3A 91C2 0B4E D815 66AF 2C90'
) ON CONFLICT (tax_id) DO NOTHING;

-- 2. Insert Default Site (Milan HQ with Geofence)
INSERT INTO public.company_sites (
    id,
    company_id,
    name,
    address,
    latitude,
    longitude,
    geofence_radius_meters,
    kiosk_secret_key
) VALUES (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Stabilimento Centrale Milano',
    'Via dell''Innovazione 42, 20126 Milano (MI)',
    45.46420000,
    9.19000000,
    150,
    'hmac_secret_aurora_milan_kiosk_2026'
) ON CONFLICT DO NOTHING;

-- 3. Insert Default Verified Employee
INSERT INTO public.users (
    id,
    company_id,
    site_id,
    full_name,
    tax_id,
    role,
    department,
    shift_schedule,
    vacation_quota_days,
    permit_quota_hours,
    preferred_language
) VALUES (
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'Collaboratore Verificato',
    'BNCMRC85M01F205Z',
    'employee',
    'Operazioni & Logistica',
    '08:30 - 17:30',
    22.0,
    32.0,
    'it'
) ON CONFLICT DO NOTHING;

-- 4. Insert Default Public Keys (X25519 & Ed25519)
INSERT INTO public.user_public_keys (
    user_id,
    x25519_public_key,
    ed25519_public_key,
    algorithm
) VALUES (
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    '4B8F 91E2 7A30 D915 88CE 3F11',
    'ED25519_PUB_4B8F_91E2_7A30_D915',
    'X25519 + Ed25519 (libsodium)'
) ON CONFLICT DO NOTHING;
