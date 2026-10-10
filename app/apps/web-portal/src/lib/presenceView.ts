import { romeWallTimeToIso } from '@fide/shared';
import type { Member, Punch } from './types';

/** Half-open Italian calendar day; DST days can contain 23 or 25 hours. */
export function presenceWindow(day: string): { from: string; to: string } {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) throw new Error('invalid_date');
  const next = new Date(midnight + 86_400_000).toISOString().slice(0, 10);
  return { from: romeWallTimeToIso(day, 0, 0), to: romeWallTimeToIso(next, 0, 0) };
}

/** Keyset pagination avoids the API row cap and offset shifts during inserts. */
export async function collectById<T extends { id: string }>(
  fetch: (after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const result: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await fetch(after);
    if (error) throw error;
    const page = data ?? [];
    if (page.length === 0) return result;
    for (const row of page) {
      if (after !== null && row.id <= after) throw new Error('pagination_order_invalid');
      result.push(row);
      after = row.id;
    }
  }
}

export function needsReview(punch: Pick<Punch, 'flags'>): boolean {
  return punch.flags.some((flag) => flag !== 'hr_entry' && flag !== 'manual_correction');
}

export interface PresenceFilters {
  search: string;
  site: string;
  manager: string;
  kind: '' | 'in' | 'out' | 'review';
}

export function filterPresence(punches: Punch[], members: Member[], filters: PresenceFilters): Punch[] {
  const people = new Map(members.map((member) => [member.id, member]));
  const search = filters.search.trim().toLocaleLowerCase();
  return punches.filter((punch) => {
    const member = people.get(punch.member_id);
    return (!filters.site || punch.site_id === filters.site)
      && (!filters.manager || member?.manager_member_id === filters.manager)
      && (!filters.kind || (filters.kind === 'review' ? needsReview(punch) : punch.punch_type === filters.kind))
      && (!search || `${member?.full_name ?? ''} ${member?.employee_number ?? ''} ${punch.receipt_code}`.toLocaleLowerCase().includes(search));
  });
}
