import type { AuditEntry, Member } from './types';

export type AuditMember = Pick<Member, 'id' | 'company_id' | 'auth_user_id' | 'full_name'> & {
  device_keys: Array<Pick<Member['device_keys'][number], 'id'>>;
};

/** Resolve only against members already visible to HR in the active company. */
export function auditActor(entry: AuditEntry, companyId: string, members: AuditMember[]): string | null {
  if (!entry.actor_auth_user_id) return null;
  return members.find((m) => m.company_id === companyId && m.auth_user_id === entry.actor_auth_user_id)?.full_name ?? null;
}

/** A member row or a device-key row can be attributed without exposing raw IDs. */
export function auditSubject(entry: AuditEntry, companyId: string, members: AuditMember[]): string | null {
  if (!entry.row_id) return null;
  if (entry.table_name === 'members') {
    return members.find((m) => m.company_id === companyId && m.id === entry.row_id)?.full_name ?? null;
  }
  if (entry.table_name === 'device_keys') {
    return members.find((m) => m.company_id === companyId && m.device_keys.some((key) => key.id === entry.row_id))?.full_name ?? null;
  }
  return null;
}
