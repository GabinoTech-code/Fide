import { describe, expect, it } from 'vitest';
import { auditActor, auditSubject } from './auditAttribution';
import type { AuditEntry, Member } from './types';

const member = (id: string, companyId: string, authUserId: string | null, keyId: string): Member => ({
  id,
  company_id: companyId,
  auth_user_id: authUserId,
  role: 'employee',
  status: 'active',
  full_name: `Member ${id}`,
  site_id: null,
  manager_member_id: null,
  employee_number: null,
  preferred_language: 'it',
  terminated_on: null,
  status_changed_at: null,
  member_identities: null,
  device_keys: [{ id: keyId, status: 'revoked', fingerprint: 'not-rendered', x25519_public_key: '', ed25519_public_key: '', created_at: '' }],
});

const entry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  table_name: 'device_keys',
  row_id: 'key-a',
  operation: 'UPDATE',
  changed_columns: ['status', 'revoked_at'],
  actor_auth_user_id: 'auth-owner',
  created_at: '2026-10-10T17:11:00Z',
  ...overrides,
});

describe('audit attribution', () => {
  const members = [member('worker', 'company-a', 'auth-worker', 'key-a'), member('owner', 'company-a', 'auth-owner', 'key-owner')];

  it('shows the actor and affected employee for a device-key rotation', () => {
    expect(auditActor(entry(), 'company-a', members)).toBe('Member owner');
    expect(auditSubject(entry(), 'company-a', members)).toBe('Member worker');
  });

  it('attributes member changes and never resolves a row from another company', () => {
    expect(auditSubject(entry({ table_name: 'members', row_id: 'worker' }), 'company-a', members)).toBe('Member worker');
    expect(auditSubject(entry({ table_name: 'members', row_id: 'worker' }), 'company-b', members)).toBeNull();
  });

  it('uses safe fallbacks without exposing an auth or row ID', () => {
    expect(auditActor(entry({ actor_auth_user_id: null }), 'company-a', members)).toBeNull();
    expect(auditActor(entry({ actor_auth_user_id: 'former-user' }), 'company-a', members)).toBeNull();
    expect(auditSubject(entry({ row_id: 'unknown-key' }), 'company-a', members)).toBeNull();
    expect(auditSubject(entry({ table_name: 'leave_requests', row_id: 'private-row' }), 'company-a', members)).toBeNull();
  });
});
