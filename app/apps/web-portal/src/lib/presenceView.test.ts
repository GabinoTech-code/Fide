import { describe, expect, it } from 'vitest';
import { collectById, filterPresence, needsReview, presenceWindow } from './presenceView';
import type { Member, Punch } from './types';

describe('presence organization', () => {
  it('uses Italian midnight, including the short and long DST days', () => {
    expect(presenceWindow('2026-10-10')).toEqual({ from: '2026-10-09T22:00:00.000Z', to: '2026-10-10T22:00:00.000Z' });
    for (const [day, hours] of [['2026-03-29', 23], ['2026-10-25', 25]] as const) {
      const bounds = presenceWindow(day);
      expect(Date.parse(bounds.to) - Date.parse(bounds.from)).toBe(hours * 3600_000);
    }
    expect(() => presenceWindow('2026-02-30')).toThrow();
  });

  it('collects more than 1000 rows even when the server caps each page below the requested limit', async () => {
    const source = Array.from({ length: 1207 }, (_, i) => ({ id: String(i).padStart(6, '0') }));
    const all = await collectById(async (after) => ({ data: source.filter((row) => after === null || row.id > after).slice(0, 73), error: null }));
    expect(all).toEqual(source);
  });

  it('fails rather than returning a partial count after an error or invalid cursor order', async () => {
    await expect(collectById(async (after) => after ? { data: null, error: new Error('offline') } : { data: [{ id: 'a' }], error: null })).rejects.toThrow('offline');
    await expect(collectById(async () => ({ data: [{ id: 'a' }], error: null }))).rejects.toThrow('pagination_order_invalid');
  });

  const member: Member = { id: 'worker', company_id: 'company', auth_user_id: null, role: 'employee', status: 'active', full_name: 'Mario Rossi', site_id: 'assigned-site', manager_member_id: 'manager', employee_number: 'EMP-42', preferred_language: 'it', terminated_on: null, status_changed_at: null, member_identities: null, device_keys: [] };
  const punch: Punch = { id: 'punch', member_id: 'worker', punch_type: 'in', method: 'qr', site_id: 'actual-site', device_ts: '2026-10-10T07:00:00Z', received_at: '2026-10-10T07:00:01Z', receipt_code: 'REC-123', flags: ['hr_entry', 'manual_correction'] };
  const filters = { search: '', site: '', manager: '', kind: '' as const };

  it('filters by name, employee number, receipt, actual punch site and assigned supervisor', () => {
    for (const search of ['ROSSI', 'EMP-42', 'rec-123']) expect(filterPresence([punch], [member], { ...filters, search })).toEqual([punch]);
    expect(filterPresence([punch], [member], { ...filters, site: 'actual-site', manager: 'manager', kind: 'in' })).toEqual([punch]);
    expect(filterPresence([punch], [member], { ...filters, site: 'assigned-site' })).toEqual([]);
    expect(filterPresence([punch], [member], { ...filters, manager: 'other' })).toEqual([]);
    expect(filterPresence([punch], [member], { ...filters, kind: 'out' })).toEqual([]);
  });

  it('keeps approved corrections visible without treating their provenance as an incident', () => {
    expect(needsReview(punch)).toBe(false);
    expect(filterPresence([punch], [member], { ...filters, kind: 'review' })).toEqual([]);
    const flagged = { ...punch, flags: ['hr_entry', 'clock_skew'] };
    expect(filterPresence([flagged], [member], { ...filters, kind: 'review' })).toEqual([flagged]);
    expect(needsReview({ flags: ['unknown_future_flag'] })).toBe(true);
  });
});
