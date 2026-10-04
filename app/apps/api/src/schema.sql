-- ============================================================================
-- FIDE ZERO-KNOWLEDGE HR & ATTENDANCE PLATFORM
-- Database Schema (PostgreSQL 15+)
-- ============================================================================

-- 1. COMPANIES / ORGANIZATIONS
CREATE TABLE companies (
    id VARCHAR(64) PRIMARY KEY,
    legal_name VARCHAR(255) NOT NULL,
    country VARCHAR(2) NOT NULL CHECK (country IN ('IT', 'ES')),
    tax_id VARCHAR(32) NOT NULL UNIQUE, -- Partita IVA (IT) or CIF/NIF (ES)
    fiscal_code VARCHAR(32),            -- Codice Fiscale (IT)
    pec_email VARCHAR(255),             -- Posta Elettronica Certificata (IT)
    sdi_code VARCHAR(16),               -- Codice Destinatario SDI (IT)
    social_security_code VARCHAR(32),   -- CCC Seguridad Social (ES)
    collective_agreement VARCHAR(128) NOT NULL, -- CCNL / Convenio Colectivo
    headquarters_address TEXT NOT NULL,
    public_key_fingerprint VARCHAR(128) NOT NULL, -- X25519 Company Public Key
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. PHYSICAL SITES & GEOFENCES
CREATE TABLE company_sites (
    id VARCHAR(64) PRIMARY KEY,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    geofence_radius_meters INTEGER NOT NULL DEFAULT 150,
    kiosk_secret_key VARCHAR(128) NOT NULL, -- HMAC secret for 30s rotating QR
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. EMPLOYEES & USERS
CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    site_id VARCHAR(64) REFERENCES company_sites(id) ON DELETE SET NULL,
    full_name VARCHAR(128) NOT NULL,
    tax_id VARCHAR(32) NOT NULL, -- Codice Fiscale (IT) or DNI/NIE (ES)
    role VARCHAR(32) NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'hr_admin', 'team_lead', 'employee')),
    department VARCHAR(128) NOT NULL,
    shift_schedule VARCHAR(64) NOT NULL DEFAULT '08:30 - 17:30',
    vacation_quota_days DECIMAL(4, 1) NOT NULL DEFAULT 22.0,
    permit_quota_hours DECIMAL(5, 1) NOT NULL DEFAULT 32.0,
    device_token VARCHAR(255), -- APNs / FCM token for encrypted push
    preferred_language VARCHAR(5) NOT NULL DEFAULT 'it',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. FIDO2 / WEBAUTHN CREDENTIALS (ZERO PASSWORD)
CREATE TABLE fido2_credentials (
    id VARCHAR(128) PRIMARY KEY, -- Credential ID from WebAuthn
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key_raw TEXT NOT NULL, -- COSE / Public key bytes in Base64
    counter BIGINT NOT NULL DEFAULT 0,
    transports VARCHAR(64), -- 'internal' (FaceID/TouchID/Windows Hello), 'usb', 'nfc'
    device_name VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. EMPLOYEE PUBLIC KEYS DIRECTORY (FOR E2EE PAYROLLS)
CREATE TABLE user_public_keys (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    x25519_public_key VARCHAR(128) NOT NULL, -- For document encryption
    ed25519_public_key VARCHAR(128) NOT NULL, -- For punch digital signatures
    algorithm VARCHAR(64) NOT NULL DEFAULT 'X25519 + Ed25519 (libsodium)',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. PUNCHES & ATTENDANCE AUDIT TRAIL (OFFLINE-FIRST SYNC)
CREATE TABLE attendance_punches (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id VARCHAR(64) REFERENCES company_sites(id),
    timestamp_epoch BIGINT NOT NULL,
    punch_type VARCHAR(16) NOT NULL CHECK (punch_type IN ('Entrada', 'Salida')),
    verification_method VARCHAR(16) NOT NULL CHECK (verification_method IN ('geo', 'qr', 'nfc')),
    in_geofence BOOLEAN NOT NULL DEFAULT TRUE,
    device_signature VARCHAR(255) NOT NULL, -- Ed25519 digital signature generated on-device
    queue_id VARCHAR(64), -- If synced from offline queue
    receipt_code VARCHAR(64) NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. ENCRYPTED PAYROLLS & DOCUMENTS (ZERO-KNOWLEDGE CIPHERTEXT STORAGE)
CREATE TABLE encrypted_documents (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (category IN ('payroll', 'certificate', 'report')),
    -- The server only stores the ciphertext. Zero plaintext is stored:
    encrypted_blob_s3_uri TEXT NOT NULL,
    nonce_hex VARCHAR(64) NOT NULL,      -- 24-byte Nonce (192-bit)
    poly1305_tag_hex VARCHAR(64) NOT NULL, -- 16-byte MAC Tag (128-bit)
    sha256_hash VARCHAR(64) NOT NULL,
    issuer_signature VARCHAR(255) NOT NULL,
    is_opened BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. EMPLOYEE INVITATIONS
CREATE TABLE employee_invitations (
    id VARCHAR(64) PRIMARY KEY,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    site_id VARCHAR(64) REFERENCES company_sites(id),
    code VARCHAR(64) NOT NULL UNIQUE,
    employee_name VARCHAR(128) NOT NULL,
    employee_email_or_phone VARCHAR(128) NOT NULL,
    department VARCHAR(128) NOT NULL,
    shift_schedule VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX idx_punches_user_time ON attendance_punches (user_id, timestamp_epoch);
CREATE INDEX idx_punches_company_time ON attendance_punches (site_id, timestamp_epoch);
CREATE INDEX idx_encrypted_docs_user ON encrypted_documents (user_id, is_opened);
CREATE INDEX idx_invitations_code ON employee_invitations (code, status);
