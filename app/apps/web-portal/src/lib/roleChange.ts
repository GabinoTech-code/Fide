import type { Member, MemberRole } from './types';

export const APPROVER_ROLES: readonly MemberRole[] = ['manager', 'hr_admin', 'company_owner'];

/** UI explanation only: the RPC and triggers remain the authority. */
export function releasedTeam(
  member: Pick<Member, 'id' | 'company_id' | 'role'>,
  nextRole: MemberRole,
  members: ReadonlyArray<Pick<Member, 'id' | 'company_id' | 'full_name' | 'manager_member_id'>>,
) {
  if (!APPROVER_ROLES.includes(member.role) || APPROVER_ROLES.includes(nextRole)) return [];
  // The trigger clears all links, including suspended and former workers.
  return members.filter((m) => m.company_id === member.company_id && m.manager_member_id === member.id);
}
