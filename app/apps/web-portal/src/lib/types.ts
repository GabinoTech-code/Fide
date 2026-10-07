// Row shapes used by the portal. Replace with the generated
// app/packages/shared/src/database.types.ts once the CI publishes it.
export type MemberRole = 'employee' | 'manager' | 'hr_admin' | 'company_owner';
export type MemberStatus = 'invited' | 'active' | 'suspended' | 'erased';

export interface Company {
  id: string;
  legal_name: string;
  vat_number: string;
  fiscal_code: string | null;
  pec: string | null;
  sdi_code: string | null;
  inps_matricola: string | null;
  ccnl: string | null;
  address: string | null;
}

export interface Membership {
  id: string;
  company_id: string;
  role: MemberRole;
  status: MemberStatus;
  full_name: string;
  companies: { legal_name: string } | null;
}

export interface Member {
  id: string;
  company_id: string;
  auth_user_id: string | null;
  role: MemberRole;
  status: MemberStatus;
  full_name: string;
  site_id: string | null;
  manager_member_id: string | null;
  employee_number: string | null;
  member_identities: { email: string | null; codice_fiscale: string | null } | null;
  device_keys: Array<{
    id: string;
    status: 'active' | 'revoked';
    fingerprint: string;
    x25519_public_key: string;
    ed25519_public_key: string;
    created_at: string;
  }>;
}

export interface Site {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_m: number;
  geo_enabled: boolean;
}

export interface Kiosk {
  id: string;
  site_id: string;
  name: string;
  status: 'pairing' | 'active' | 'revoked';
  paired_at: string | null;
}

export interface Punch {
  id: string;
  member_id: string;
  punch_type: 'in' | 'out';
  method: 'geo' | 'qr' | 'manual';
  site_id: string | null;
  device_ts: string;
  received_at: string;
  receipt_code: string;
  flags: string[];
}

export interface LeaveRequest {
  id: string;
  member_id: string;
  start_date: string;
  end_date: string;
  quantity: number;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  leave_types: { code: string; name: string; unit: 'days' | 'hours' } | null;
}

export interface PunchCorrection {
  id: string;
  member_id: string;
  punch_type: 'in' | 'out';
  requested_ts: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export interface AuditEntry {
  id: number;
  table_name: string;
  row_id: string | null;
  operation: string;
  changed_columns: string[] | null;
  actor_auth_user_id: string | null;
  created_at: string;
}

export interface PayrollBatch {
  id: string;
  kind: 'cedolino' | 'cu' | 'other';
  period: string;
  title: string;
  status: 'draft' | 'published';
  created_at: string;
  published_at: string | null;
  /** Documents of the batch, for delivery tracking (opened on the phone or not). */
  documents: Array<{ id: string; status: string; first_opened_at: string | null }>;
}
