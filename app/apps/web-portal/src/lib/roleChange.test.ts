import { describe, expect, it } from 'vitest';
import { MEMBER_CHANGE_QUERY_KEYS, releasedTeam } from './roleChange';
import { QueryClient } from '@tanstack/react-query';
import type { MemberRole } from './types';

const manager = { id: 'manager-a', company_id: 'company-a', role: 'manager' as const };
const team = [
  { id: 'worker-a', company_id: 'company-a', full_name: 'Worker A', manager_member_id: 'manager-a' },
  { id: 'worker-b', company_id: 'company-a', full_name: 'Worker B', manager_member_id: 'another-manager' },
  { id: 'foreign', company_id: 'company-b', full_name: 'Foreign worker', manager_member_id: 'manager-a' },
];

describe('role change explanation', () => {
  it('invalidates the signed-in membership as well as employee data after a change', async () => {
    const client = new QueryClient();
    const keys = [['memberships', 'owner-user'], ['members', 'company-a']];
    keys.forEach((key) => client.setQueryData(key, { role: 'company_owner' }));
    await Promise.all(MEMBER_CHANGE_QUERY_KEYS.map((key) => client.invalidateQueries({ queryKey: [key] })));
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    client.clear();
  });
  it.each<MemberRole>(['manager', 'hr_admin', 'company_owner'])('warns about released workers when %s becomes an employee', (role) => {
    expect(releasedTeam({ ...manager, role }, 'employee', team).map((m) => m.id)).toEqual(['worker-a']);
  });
  it.each<MemberRole>(['manager', 'hr_admin', 'company_owner'])('does not claim team removal when the next role is %s', (role) => {
    expect(releasedTeam(manager, role, team)).toEqual([]);
  });
  it('excludes other companies and does not claim team changes for an employee', () => {
    expect(releasedTeam(manager, 'employee', team).some((m) => m.company_id !== manager.company_id)).toBe(false);
    expect(releasedTeam({ ...manager, role: 'employee' }, 'employee', team)).toEqual([]);
    expect(releasedTeam(manager, 'employee', [])).toEqual([]);
  });
});
