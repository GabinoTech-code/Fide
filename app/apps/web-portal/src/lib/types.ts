// Row shapes used by the portal. Replace with the generated
// app/packages/shared/src/database.types.ts once the CI publishes it.
export type MemberRole = 'employee' | 'manager' | 'hr_admin' | 'company_owner';
export type MemberStatus = 'invited' | 'active' | 'suspended' | 'terminated' | 'erased';

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
  preferred_language: string;
  /** Last working day, for status 'terminated'. */
  terminated_on: string | null;
  status_changed_at: string | null;
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

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  member_id: string;
  start_date: string;
  end_date: string;
  quantity: number;
  note: string | null;
  status: RequestStatus;
  leave_types: { code: string; name: string; unit: 'days' | 'hours' } | null;
  created_at?: string;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  /** Set when HR recorded it on the employee's behalf. */
  entered_by?: string | null;
}

export interface PunchCorrection {
  id: string;
  member_id: string;
  punch_type: 'in' | 'out';
  requested_ts: string;
  reason: string;
  status: RequestStatus;
  created_at?: string;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  entered_by?: string | null;
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
  /** Documents of the batch, for delivery tracking (opened on the phone or not) and withdrawal. */
  documents: BatchDocument[];
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  unit: 'days' | 'hours';
  requires_protocol: boolean;
  active: boolean;
}

export type GdprKind = 'access' | 'portability' | 'erasure' | 'rectification' | 'objection';
export type GdprStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface GdprRequest {
  id: string;
  member_id: string;
  kind: GdprKind;
  details: string | null;
  status: GdprStatus;
  created_at: string;
  due_at: string;
  extended_at: string | null;
  extension_note: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
}

export interface BatchDocument {
  id: string;
  batch_id: string;
  member_id: string;
  title: string;
  status: 'draft' | 'published' | 'superseded' | 'deleted';
  first_opened_at: string | null;
  storage_path: string;
}
