// Monthly attendance for the consulente del lavoro: one line per employee and
// day (entries/exits, worked time, absences, anomalies) and a per-employee
// summary. It feeds the payroll and the LUL; it does not replace them.
// Everything is computed in Europe/Rome local time, in this browser.

export const REPORT_TZ = 'Europe/Rome';

export interface ReportPunch {
  member_id: string;
  punch_type: 'in' | 'out';
  method: 'geo' | 'qr' | 'manual';
  device_ts: string;
  flags: string[];
}

export interface ReportLeave {
  member_id: string;
  start_date: string;
  end_date: string;
  quantity: number;
  leave_types: { code: string; unit: 'days' | 'hours' } | null;
}

export interface ReportMember {
  id: string;
  full_name: string;
  employee_number: string | null;
  codice_fiscale: string | null;
}

export type Anomaly = 'missing_out' | 'missing_in' | 'long_shift' | 'corrected' | 'flagged';

export interface Interval {
  /** HH:MM local, null when the punch is missing. */
  in: string | null;
  out: string | null;
  minutes: number;
}

export interface DayLine {
  memberId: string;
  /** YYYY-MM-DD local. */
  date: string;
  intervals: Interval[];
  workedMinutes: number;
  absences: string[];
  anomalies: Anomaly[];
}

export interface MemberSummary {
  memberId: string;
  daysWorked: number;
  workedMinutes: number;
  absences: Record<string, { days: number; hours: number }>;
  anomalies: number;
}

/** A shift longer than this is almost always a forgotten exit. */
export const LONG_SHIFT_MINUTES = 16 * 60;

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function localParts(iso: string): { date: string; time: string } {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** UTC window that surely contains the local month, plus room for night shifts across its edges. */
export function fetchWindow(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return {
    from: new Date(Date.UTC(y, m - 1, 1) - 24 * 3600_000).toISOString(),
    to: new Date(Date.UTC(y, m, 1) + 24 * 3600_000).toISOString(),
  };
}

export function daysOf(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function buildMonthlyReport(input: {
  month: string;
  members: ReportMember[];
  punches: ReportPunch[];
  leave: ReportLeave[];
}): { lines: DayLine[]; summaries: MemberSummary[] } {
  const days = new Set(daysOf(input.month));
  const lines = new Map<string, DayLine>();
  const line = (memberId: string, date: string) => {
    const key = `${memberId}|${date}`;
    let l = lines.get(key);
    if (!l) lines.set(key, (l = { memberId, date, intervals: [], workedMinutes: 0, absences: [], anomalies: [] }));
    return l;
  };
  const mark = (l: DayLine, a: Anomaly) => {
    if (!l.anomalies.includes(a)) l.anomalies.push(a);
  };

  // Pair punches per member across the whole window, so a night shift that
  // starts on the 31st and ends on the 1st is one interval, on the day it began.
  const byMember = new Map<string, ReportPunch[]>();
  for (const p of input.punches) {
    const list = byMember.get(p.member_id) ?? [];
    list.push(p);
    byMember.set(p.member_id, list);
  }
  for (const [memberId, list] of byMember) {
    list.sort((a, b) => a.device_ts.localeCompare(b.device_ts));
    let open: ReportPunch | null = null;
    const emit = (start: ReportPunch | null, end: ReportPunch | null) => {
      const anchor = (start ?? end)!;
      const { date } = localParts(anchor.device_ts);
      if (!days.has(date)) return;
      const l = line(memberId, date);
      const minutes = start && end ? Math.round((Date.parse(end.device_ts) - Date.parse(start.device_ts)) / 60_000) : 0;
      l.intervals.push({ in: start ? localParts(start.device_ts).time : null, out: end ? localParts(end.device_ts).time : null, minutes });
      l.workedMinutes += minutes;
      if (!start) mark(l, 'missing_in');
      if (!end) mark(l, 'missing_out');
      if (minutes > LONG_SHIFT_MINUTES) mark(l, 'long_shift');
      if (start?.method === 'manual' || end?.method === 'manual') mark(l, 'corrected');
      if (start?.flags.length || end?.flags.length) mark(l, 'flagged');
    };
    for (const p of list) {
      if (p.punch_type === 'in') {
        if (open) emit(open, null);
        open = p;
      } else {
        emit(open, p);
        open = null;
      }
    }
    if (open) emit(open, null);
  }

  for (const r of input.leave) {
    if (!r.leave_types) continue;
    const { code, unit } = r.leave_types;
    const single = r.start_date === r.end_date;
    for (const date of daysOf(input.month)) {
      if (date < r.start_date || date > r.end_date) continue;
      line(r.member_id, date).absences.push(unit === 'hours' && single ? `${code} ${formatHours(r.quantity)}h` : code);
    }
  }

  const sorted = [...lines.values()].sort((a, b) => a.memberId.localeCompare(b.memberId) || a.date.localeCompare(b.date));
  const summaries = input.members.map((m): MemberSummary => {
    const own = sorted.filter((l) => l.memberId === m.id);
    const absences: MemberSummary['absences'] = {};
    for (const r of input.leave.filter((x) => x.member_id === m.id && x.leave_types)) {
      const { code, unit } = r.leave_types!;
      const inMonth = daysOf(input.month).filter((d) => d >= r.start_date && d <= r.end_date).length;
      if (!inMonth) continue;
      const a = (absences[code] ??= { days: 0, hours: 0 });
      if (unit === 'hours') a.hours += r.start_date === r.end_date ? Number(r.quantity) : 0;
      else a.days += inMonth;
    }
    return {
      memberId: m.id,
      daysWorked: own.filter((l) => l.workedMinutes > 0).length,
      workedMinutes: own.reduce((sum, l) => sum + l.workedMinutes, 0),
      absences,
      anomalies: own.reduce((sum, l) => sum + l.anomalies.length, 0),
    };
  });
  return { lines: sorted, summaries };
}

const formatHours = (h: number) => String(Number(h)).replace('.', ',');

/** 510 → "8:30" */
export const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
/** 510 → "8,50" (centesimi, decimal comma for Italian Excel) */
export const centesimi = (minutes: number) => (minutes / 60).toFixed(2).replace('.', ',');

// ---------------------------------------------------------------------------
// CSV (";" + BOM: what Italian Excel opens correctly)
// ---------------------------------------------------------------------------

/**
 * Quotes when needed and neutralises spreadsheet formulas: a name such as
 * "=HYPERLINK(…)" must not run when the consulente opens the file.
 */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (rows: Array<Array<string | number>>) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';

export interface ReportLabels {
  detailHeader: string[];
  summaryHeader: string[];
  /** Suffix for whole days of absence ("g" in Italian). */
  dayUnit: string;
  anomaly: (a: Anomaly) => string;
}

const italianDate = (iso: string) => iso.split('-').reverse().join('/');

export function detailCsv(report: { lines: DayLine[] }, members: ReportMember[], labels: ReportLabels): string {
  const byId = new Map(members.map((m) => [m.id, m]));
  return toCsv([
    labels.detailHeader,
    ...report.lines.map((l) => {
      const m = byId.get(l.memberId);
      return [
        m?.employee_number ?? '',
        m?.codice_fiscale ?? '',
        m?.full_name ?? l.memberId,
        italianDate(l.date),
        l.intervals.map((i) => `${i.in ?? '?'}-${i.out ?? '?'}`).join(' '),
        hhmm(l.workedMinutes),
        centesimi(l.workedMinutes),
        l.absences.join(' '),
        l.anomalies.map(labels.anomaly).join(', '),
      ];
    }),
  ]);
}

export function summaryCsv(report: { summaries: MemberSummary[] }, members: ReportMember[], labels: ReportLabels): string {
  const byId = new Map(members.map((m) => [m.id, m]));
  return toCsv([
    labels.summaryHeader,
    ...report.summaries.map((s) => {
      const m = byId.get(s.memberId);
      const absences = Object.entries(s.absences)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, v]) => [v.days ? `${code} ${v.days}${labels.dayUnit}` : '', v.hours ? `${code} ${formatHours(v.hours)}h` : ''].filter(Boolean).join(' '))
        .join(' ');
      return [m?.employee_number ?? '', m?.codice_fiscale ?? '', m?.full_name ?? s.memberId, s.daysWorked, hhmm(s.workedMinutes), centesimi(s.workedMinutes), absences, s.anomalies];
    }),
  ]);
}
