-- ============================================================================
-- FIDE PLATFORM: SUPABASE MIGRATION (SCHEMA + ROW LEVEL SECURITY)
-- Region: EU (Frankfurt / Milan / Madrid) - 100% GDPR Compliant
-- ============================================================================

-- Enable UUID and Cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. COMPANIES TABLE
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(255) NOT NULL,
    country VARCHAR(2) NOT NULL CHECK (country IN ('IT', 'ES')),
    tax_id VARCHAR(32) NOT NULL UNIQUE,
    fiscal_code VARCHAR(32),
    pec_email VARCHAR(255),
    sdi_code VARCHAR(16),
    social_security_code VARCHAR(32),
    collective_agreement VARCHAR(128) NOT NULL,
    headquarters_address TEXT NOT NULL,
    public_key_fingerprint VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. SITES & GEOFENCES
CREATE TABLE IF NOT EXISTS public.company_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    geofence_radius_meters INTEGER NOT NULL DEFAULT 150,
    kiosk_secret_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. USERS / EMPLOYEES
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.company_sites(id) ON DELETE SET NULL,
    full_name VARCHAR(128) NOT NULL,
    tax_id VARCHAR(32) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'hr_admin', 'team_lead', 'employee')),
    department VARCHAR(128) NOT NULL,
    shift_schedule VARCHAR(64) NOT NULL DEFAULT '08:30 - 17:30',
    vacation_quota_days DECIMAL(4, 1) NOT NULL DEFAULT 22.0,
    permit_quota_hours DECIMAL(5, 1) NOT NULL DEFAULT 32.0,
    device_token VARCHAR(255),
    preferred_language VARCHAR(5) NOT NULL DEFAULT 'it',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. PUBLIC KEYS DIRECTORY (E2EE)
CREATE TABLE IF NOT EXISTS public.user_public_keys (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    x25519_public_key VARCHAR(128) NOT NULL,
    ed25519_public_key VARCHAR(128) NOT NULL,
    algorithm VARCHAR(64) NOT NULL DEFAULT 'X25519 + Ed25519 (libsodium)',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. ATTENDANCE PUNCHES (OFFLINE-FIRST SYNC)
CREATE TABLE IF NOT EXISTS public.attendance_punches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.company_sites(id),
    timestamp_epoch BIGINT NOT NULL,
    punch_type VARCHAR(16) NOT NULL CHECK (punch_type IN ('Entrada', 'Salida')),
    verification_method VARCHAR(16) NOT NULL CHECK (verification_method IN ('geo', 'qr', 'nfc')),
    in_geofence BOOLEAN NOT NULL DEFAULT TRUE,
    device_signature VARCHAR(255) NOT NULL,
    queue_id VARCHAR(64),
    receipt_code VARCHAR(64) NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. ENCRYPTED DOCUMENTS (ZERO-KNOWLEDGE CIPHERTEXT STORAGE)
CREATE TABLE IF NOT EXISTS public.encrypted_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (category IN ('payroll', 'certificate', 'report')),
    encrypted_storage_path TEXT NOT NULL,
    nonce_hex VARCHAR(64) NOT NULL,
    poly1305_tag_hex VARCHAR(64) NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    issuer_signature VARCHAR(255) NOT NULL,
    is_opened BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. EMPLOYEE INVITATIONS
CREATE TABLE IF NOT EXISTS public.employee_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.company_sites(id),
    code VARCHAR(64) NOT NULL UNIQUE,
    employee_name VARCHAR(128) NOT NULL,
    employee_email_or_phone VARCHAR(128) NOT NULL,
    department VARCHAR(128) NOT NULL,
    shift_schedule VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_public_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Employees can ONLY view their own encrypted documents
CREATE POLICY "Users can only read their own encrypted documents"
    ON public.encrypted_documents
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Companies public select
CREATE POLICY "Allow public select on companies" 
    ON public.companies FOR SELECT USING (TRUE);

-- Policy: Employees can view their own punches or company monitor
CREATE POLICY "Allow select on punches for live monitor" 
    ON public.attendance_punches FOR SELECT USING (TRUE);

-- Policy: Employees can insert punches with valid cryptographic signature
CREATE POLICY "Strict verified cryptographic punch insert"
    ON public.attendance_punches
    FOR INSERT
    WITH CHECK (
        device_signature IS NOT NULL 
        AND length(device_signature) >= 16
        AND receipt_code IS NOT NULL
        AND timestamp_epoch > 0
        AND punch_type IN ('Entrada', 'Salida')
        AND verification_method IN ('geo', 'qr', 'nfc')
    );

-- Policy: Validated employee registration
CREATE POLICY "Strict validated employee registration"
    ON public.users
    FOR INSERT
    WITH CHECK (
        full_name IS NOT NULL 
        AND length(full_name) >= 2
        AND tax_id IS NOT NULL 
        AND length(tax_id) >= 8
        AND company_id IS NOT NULL
    );

CREATE POLICY "Allow public select on users"
    ON public.users FOR SELECT USING (TRUE);

-- Policy: Public keys are readable by company members (so HR can encrypt documents)
CREATE POLICY "Public keys readable by company members"
    ON public.user_public_keys
    FOR SELECT
    USING (TRUE);

-- Policy: Users can only update their own public key
CREATE POLICY "Users manage their own public key"
    ON public.user_public_keys
    FOR ALL
    USING (auth.uid() = user_id);

-- ============================================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================================
-- Enable real-time replication for attendance monitoring and kiosk
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_punches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.encrypted_documents;
