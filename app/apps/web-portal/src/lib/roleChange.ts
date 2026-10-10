import type { Member, MemberRole } from './types';

export const APPROVER_ROLES: readonly MemberRole[] = ['manager', 'hr_admin', 'company_owner'];

/** Include the signed-in user's membership so self-demotion updates route access. */
export const MEMBER_CHANGE_QUERY_KEYS = ['memberships', 'members', 'punches', 'leave', 'corrections', 'requestHistory', 'payroll'] as const;

export function isLastActiveOwner(member: Pick<Member, 'role' | 'status' | 'company_id'>, members: ReadonlyArray<Pick<Member, 'role' | 'status' | 'company_id'>>) {
  return member.role === 'company_owner' && member.status === 'active'
    && members.filter((item) => item.company_id === member.company_id && item.role === 'company_owner' && item.status === 'active').length <= 1;
}

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
