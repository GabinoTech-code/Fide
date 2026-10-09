import { describe, expect, it } from 'vitest';
import { filterHistory, mergeHistory } from './requestHistory';
import type { LeaveRequest, PunchCorrection } from './types';

const leave = (id: string, over: Partial<LeaveRequest>): LeaveRequest => ({
  id,
  member_id: 'marco',
  start_date: '2026-12-28',
  end_date: '2026-12-29',
  quantity: 2,
  note: null,
  status: 'approved',
  leave_types: { code: 'FERIE', name: 'Ferie', unit: 'days' },
  created_at: '2026-10-01T08:00:00Z',
  decided_at: '2026-10-02T08:00:00Z',
  decided_by: 'giulia',
  decision_note: null,
  entered_by: null,
  ...over,
});

const correction = (id: string, over: Partial<PunchCorrection>): PunchCorrection => ({
  id,
  member_id: 'anna',
  punch_type: 'out',
  requested_ts: '2026-10-05T16:00:00Z',
  reason: 'Dimenticata',
  status: 'rejected',
  created_at: '2026-10-05T18:00:00Z',
  decided_at: '2026-10-06T09:00:00Z',
  decided_by: 'luca',
  decision_note: 'Non risulta in sede',
  entered_by: null,
  ...over,
});

const names = new Map([
  ['marco', 'Marco Colombo'],
  ['anna', 'Anna Galli'],
  ['nicolo', 'Nicolò Bianchi'],
]);

describe('request history', () => {
  it('merges both kinds, drops pending ones and sorts by decision time', () => {
    const items = mergeHistory(
      [
        leave('old', { decided_at: '2026-09-01T00:00:00Z' }),
        leave('pending', { status: 'pending', decided_at: null }),
        leave('cancelled', { status: 'cancelled', decided_at: null, decided_by: null, created_at: '2026-10-03T00:00:00Z' }),
      ],
      [correction('c1', {})],
    );
    expect(items.map((i) => i.id)).toEqual(['c1', 'cancelled', 'old']);
    expect(items[0]).toMatchObject({ kind: 'correction', label: 'out', note: 'Non risulta in sede', decidedBy: 'luca' });
    expect(items.find((i) => i.id === 'old')).toMatchObject({ end: '2026-12-29', quantity: 2, unit: 'days' });
  });

  it('flags entries recorded by HR and keeps one-day leave without an end', () => {
    const [item] = mergeHistory([leave('hr', { entered_by: 'giulia', end_date: '2026-12-28' })], []);
    expect(item).toMatchObject({ enteredByHr: true, end: null });
  });

  it('filters by kind, outcome and name, ignoring case and accents', () => {
    const items = mergeHistory(
      [leave('l1', {}), leave('l2', { member_id: 'nicolo', status: 'rejected' })],
      [correction('c1', {})],
    );
    const all = { kind: 'all', status: 'all', query: '' } as const;
    expect(filterHistory(items, { ...all, kind: 'leave' }, names).map((i) => i.id).sort()).toEqual(['l1', 'l2']);
    expect(filterHistory(items, { ...all, status: 'rejected' }, names).map((i) => i.id).sort()).toEqual(['c1', 'l2']);
    expect(filterHistory(items, { ...all, query: 'nicolo' }, names).map((i) => i.id)).toEqual(['l2']);
    expect(filterHistory(items, { ...all, query: '  GALLI ' }, names).map((i) => i.id)).toEqual(['c1']);
  });
});
