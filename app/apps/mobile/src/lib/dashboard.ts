// Pure helpers behind the home screen: today's working state from the punches
// and the notices feed (new documents, decisions taken by HR).

export interface DayPunch {
  type: 'in' | 'out';
  ts: string;
}

export interface Workday {
  /** 'in' while a shift is open, 'out' after the last exit, 'none' before the first punch. */
  state: 'none' | 'in' | 'out';
  /** Time of the last punch, if any. */
  since: string | null;
  /** Worked time today in ms: closed in→out pairs plus the open one up to `now`. */
  workedMs: number;
}

export function workday(punches: DayPunch[], now: number): Workday {
  const sorted = [...punches].sort((a, b) => a.ts.localeCompare(b.ts));
  let workedMs = 0;
  let openedAt: number | null = null;
  for (const p of sorted) {
    const t = Date.parse(p.ts);
    if (p.type === 'in') {
      if (openedAt === null) openedAt = t;
    } else if (openedAt !== null) {
      workedMs += Math.max(0, t - openedAt);
      openedAt = null;
    }
  }
  if (openedAt !== null) workedMs += Math.max(0, now - openedAt);
  const last = sorted.at(-1);
  return { state: last ? last.type : 'none', since: last?.ts ?? null, workedMs };
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export type Decision = 'approved' | 'rejected';

export type Notice =
  | { kind: 'document'; id: string; title: string; at: string }
  // byHr: recorded by HR on the employee's behalf, not a request the employee made.
  | { kind: 'leave'; id: string; label: string; status: Decision; byHr: boolean; at: string }
  | { kind: 'correction'; id: string; punchType: 'in' | 'out'; status: Decision; byHr: boolean; at: string };

interface DocumentLike {
  id: string;
  title: string;
  status: string;
  published_at: string;
  first_opened_at: string | null;
}
interface DecidedLike {
  id: string;
  status: string;
  decided_at?: string | null;
  entered_by?: string | null;
}

/** How long a decision stays in the feed. */
export const NOTICE_DAYS = 14;

export function buildNotices(
  input: {
    documents: DocumentLike[];
    leave: (DecidedLike & { leave_types: { name: string } | null })[];
    corrections: (DecidedLike & { punch_type: 'in' | 'out' })[];
  },
  now: number,
): Notice[] {
  const cutoff = now - NOTICE_DAYS * 86_400_000;
  const recent = (r: DecidedLike): r is DecidedLike & { status: Decision; decided_at: string } =>
    (r.status === 'approved' || r.status === 'rejected') && Boolean(r.decided_at) && Date.parse(r.decided_at!) >= cutoff;

  const notices: Notice[] = [
    ...input.documents
      .filter((d) => d.status === 'published' && !d.first_opened_at)
      .map((d): Notice => ({ kind: 'document', id: d.id, title: d.title, at: d.published_at })),
    ...input.leave
      .filter(recent)
      .map((r): Notice => ({ kind: 'leave', id: r.id, label: r.leave_types?.name ?? '', status: r.status as Decision, byHr: Boolean(r.entered_by), at: r.decided_at! })),
    ...input.corrections
      .filter(recent)
      .map((c): Notice => ({ kind: 'correction', id: c.id, punchType: c.punch_type, status: c.status as Decision, byHr: Boolean(c.entered_by), at: c.decided_at! })),
  ];
  return notices.sort((a, b) => b.at.localeCompare(a.at));
}
