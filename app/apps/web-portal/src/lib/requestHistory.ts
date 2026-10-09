// Request history for the portal (audit V4): leave requests and punch
// corrections that are no longer pending, in one list, newest decision first.
import type { LeaveRequest, PunchCorrection, RequestStatus } from './types';

export interface HistoryItem {
  id: string;
  kind: 'leave' | 'correction';
  memberId: string;
  status: Exclude<RequestStatus, 'pending'>;
  /** Leave type name, or 'in' / 'out' for a correction. */
  label: string;
  /** Leave: first and last day; correction: the requested time. */
  start: string;
  end: string | null;
  quantity: number | null;
  unit: 'days' | 'hours' | null;
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
  enteredByHr: boolean;
  /** Sort key: when it was decided, or created if never decided (cancelled). */
  at: string;
}

export function mergeHistory(leave: LeaveRequest[], corrections: PunchCorrection[]): HistoryItem[] {
  const items: HistoryItem[] = [
    ...leave
      .filter((r) => r.status !== 'pending')
      .map((r): HistoryItem => ({
        id: r.id,
        kind: 'leave',
        memberId: r.member_id,
        status: r.status as HistoryItem['status'],
        label: r.leave_types?.name ?? '',
        start: r.start_date,
        end: r.end_date !== r.start_date ? r.end_date : null,
        quantity: Number(r.quantity),
        unit: r.leave_types?.unit ?? null,
        reason: r.note,
        decidedBy: r.decided_by ?? null,
        decidedAt: r.decided_at ?? null,
        note: r.decision_note ?? null,
        enteredByHr: Boolean(r.entered_by),
        at: r.decided_at ?? r.created_at ?? r.start_date,
      })),
    ...corrections
      .filter((c) => c.status !== 'pending')
      .map((c): HistoryItem => ({
        id: c.id,
        kind: 'correction',
        memberId: c.member_id,
        status: c.status as HistoryItem['status'],
        label: c.punch_type,
        start: c.requested_ts,
        end: null,
        quantity: null,
        unit: null,
        reason: c.reason,
        decidedBy: c.decided_by ?? null,
        decidedAt: c.decided_at ?? null,
        note: c.decision_note ?? null,
        enteredByHr: Boolean(c.entered_by),
        at: c.decided_at ?? c.created_at ?? c.requested_ts,
      })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export interface HistoryFilter {
  kind: 'all' | 'leave' | 'correction';
  status: 'all' | HistoryItem['status'];
  /** Free text matched against the employee's name (case and accents ignored). */
  query: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function filterHistory(items: HistoryItem[], f: HistoryFilter, names: Map<string, string>): HistoryItem[] {
  const q = fold(f.query.trim());
  return items.filter(
    (i) =>
      (f.kind === 'all' || i.kind === f.kind) &&
      (f.status === 'all' || i.status === f.status) &&
      (!q || fold(names.get(i.memberId) ?? '').includes(q)),
  );
}
