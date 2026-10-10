// March 2026: Italy moves to summer time on Sunday 29 March (UTC+1 → UTC+2),
// so the same local 08:00 is 07:00Z before and 06:00Z after.
import { describe, expect, it } from 'vitest';
import {
  buildMonthlyReport,
  centesimi,
  csvCell,
  daysOf,
  detailCsv,
  fetchWindow,
  hhmm,
  localParts,
  LeaveAllocationError,
  summaryCsv,
  type ReportLabels,
  type ReportLeave,
  type ReportMember,
  type ReportPunch,
} from './monthlyReport';

const MONTH = '2026-03';
const members: ReportMember[] = [
  { id: 'anna', full_name: 'Anna Galli', employee_number: '007', codice_fiscale: 'GLLNNA95S48A944C' },
  { id: 'marco', full_name: 'Marco Colombo', employee_number: null, codice_fiscale: 'CLMMRC88M03D612C' },
];
const p = (member_id: string, punch_type: 'in' | 'out', device_ts: string, extra: Partial<ReportPunch> = {}): ReportPunch => ({
  member_id,
  punch_type,
  method: 'qr',
  device_ts,
  flags: [],
  ...extra,
});
const leave = (member_id: string, code: string, unit: 'days' | 'hours', start_date: string, end_date: string, quantity: number): ReportLeave => ({
  member_id,
  start_date,
  end_date,
  quantity,
  leave_types: { code, unit },
});

const labels: ReportLabels = {
  detailHeader: ['Matricola', 'Codice fiscale', 'Dipendente', 'Data', 'Entrate/Uscite', 'Ore', 'Centesimi', 'Assenze', 'Anomalie'],
  summaryHeader: ['Matricola', 'Codice fiscale', 'Dipendente', 'Giorni', 'Ore', 'Centesimi', 'Assenze', 'Anomalie'],
  dayUnit: 'g',
  anomaly: (a) => a,
};

describe('time helpers', () => {
  it('uses Rome local time across the DST change', () => {
    expect(localParts('2026-03-02T07:00:00Z')).toEqual({ date: '2026-03-02', time: '08:00' });
    expect(localParts('2026-03-30T06:00:00Z')).toEqual({ date: '2026-03-30', time: '08:00' });
    expect(localParts('2026-03-31T22:30:00Z')).toEqual({ date: '2026-04-01', time: '00:30' });
  });

  it('formats worked time for the consulente', () => {
    expect(hhmm(510)).toBe('8:30');
    expect(hhmm(5)).toBe('0:05');
    expect(centesimi(510)).toBe('8,50');
    expect(centesimi(20)).toBe('0,33');
    expect(daysOf('2026-02')).toHaveLength(28);
    expect(fetchWindow('2026-03')).toEqual({ from: '2026-02-28T00:00:00.000Z', to: '2026-04-02T00:00:00.000Z' });
  });
});

describe('buildMonthlyReport', () => {
  const report = buildMonthlyReport({
    month: MONTH,
    members,
    punches: [
      // Anna, Monday 2: morning and afternoon (CET).
      p('anna', 'in', '2026-03-02T07:00:00Z'),
      p('anna', 'out', '2026-03-02T11:00:00Z'),
      p('anna', 'in', '2026-03-02T12:00:00Z'),
      p('anna', 'out', '2026-03-02T16:00:00Z'),
      // Anna, Tuesday 3: forgot to clock out; HR approved the exit afterwards.
      p('anna', 'in', '2026-03-03T07:00:00Z'),
      p('anna', 'out', '2026-03-03T16:30:00Z', { method: 'manual' }),
      // Anna, Monday 30 (CEST): 08:00–17:00, flagged by the server.
      p('anna', 'in', '2026-03-30T06:00:00Z', { flags: ['late_sync'] }),
      p('anna', 'out', '2026-03-30T15:00:00Z'),
      // Marco: a night shift from February does not count in March…
      p('marco', 'in', '2026-02-28T21:00:00Z'),
      p('marco', 'out', '2026-03-01T05:00:00Z'),
      // …entry without exit on the 4th, exit without entry on the 5th…
      p('marco', 'in', '2026-03-04T07:00:00Z'),
      p('marco', 'in', '2026-03-05T07:00:00Z'),
      p('marco', 'out', '2026-03-05T15:00:00Z'),
      p('marco', 'out', '2026-03-06T15:00:00Z'),
      // …a 17-hour "shift" (forgotten exit, punched next morning)…
      p('marco', 'in', '2026-03-10T07:00:00Z'),
      p('marco', 'out', '2026-03-11T00:00:00Z'),
      // …and a night shift that crosses into April counts on the 31st.
      p('marco', 'in', '2026-03-31T20:00:00Z'),
      p('marco', 'out', '2026-04-01T04:00:00Z'),
      p('marco', 'in', '2026-04-01T20:00:00Z'),
    ],
    leave: [
      leave('anna', 'FERIE', 'days', '2026-03-09', '2026-03-13', 5),
      leave('anna', 'ROL', 'hours', '2026-03-16', '2026-03-16', 2.5),
      leave('marco', 'MALATTIA', 'days', '2026-02-26', '2026-03-02', 3),
    ],
  });
  const day = (memberId: string, date: string) => report.lines.find((l) => l.memberId === memberId && l.date === date);

  it('pairs entries and exits into intervals per local day', () => {
    expect(day('anna', '2026-03-02')).toMatchObject({
      intervals: [
        { in: '08:00', out: '12:00', minutes: 240 },
        { in: '13:00', out: '17:00', minutes: 240 },
      ],
      workedMinutes: 480,
      anomalies: [],
    });
    expect(day('anna', '2026-03-30')).toMatchObject({ intervals: [{ in: '08:00', out: '17:00', minutes: 540 }], anomalies: ['flagged'] });
  });

  it('marks HR corrections and missing or suspicious punches', () => {
    expect(day('anna', '2026-03-03')).toMatchObject({ workedMinutes: 570, anomalies: ['corrected'] });
    expect(day('marco', '2026-03-04')).toMatchObject({ intervals: [{ in: '08:00', out: null, minutes: 0 }], anomalies: ['missing_out'] });
    expect(day('marco', '2026-03-05')).toMatchObject({ workedMinutes: 480, anomalies: [] });
    expect(day('marco', '2026-03-06')).toMatchObject({ intervals: [{ in: null, out: '16:00', minutes: 0 }], anomalies: ['missing_in'] });
    expect(day('marco', '2026-03-10')).toMatchObject({ workedMinutes: 17 * 60, anomalies: ['long_shift'] });
  });

  it('keeps night shifts on the day they start, inside the month only', () => {
    expect(day('marco', '2026-02-28')).toBeUndefined();
    expect(day('marco', '2026-03-01')).toBeUndefined();
    expect(day('marco', '2026-03-31')).toMatchObject({ intervals: [{ in: '22:00', out: '06:00', minutes: 480 }] });
    expect(report.lines.some((l) => l.date.startsWith('2026-04'))).toBe(false);
  });

  it('spreads approved absences over the days of the month', () => {
    expect(['09', '10', '11', '12', '13'].map((d) => day('anna', `2026-03-${d}`)?.absences)).toEqual(Array(5).fill(['FERIE']));
    expect(day('anna', '2026-03-16')?.absences).toEqual(['ROL 2,5h']);
  });

  it('summarises each employee', () => {
    expect(report.summaries).toEqual([
      { memberId: 'anna', daysWorked: 3, workedMinutes: 480 + 570 + 540, absences: { FERIE: { days: 5, hours: 0 }, ROL: { days: 0, hours: 2.5 } }, anomalies: 2 },
      // 4th: 0 min (missing exit), 5th: 8 h, 10th: 17 h, 31st: 8 h; one approved working day in March.
      { memberId: 'marco', daysWorked: 3, workedMinutes: 480 + 17 * 60 + 480, absences: { MALATTIA: { days: 1, hours: 0 } }, anomalies: 3 },
    ]);
  });

  it('writes CSV files Italian Excel opens as is', () => {
    const detail = detailCsv(report, members, labels);
    expect(detail.startsWith('﻿Matricola;Codice fiscale;')).toBe(true);
    expect(detail).toContain('\r\n007;GLLNNA95S48A944C;Anna Galli;02/03/2026;08:00-12:00 13:00-17:00;8:00;8,00;;\r\n');
    expect(detail).toContain(';Marco Colombo;04/03/2026;08:00-?;0:00;0,00;;missing_out\r\n');
    const summary = summaryCsv(report, members, labels);
    expect(summary).toContain('007;GLLNNA95S48A944C;Anna Galli;3;26:30;26,50;FERIE 5g ROL 2,5h;2\r\n');
  });
});

describe('approved leave allocation', () => {
  const build = (month: string, request: ReportLeave) => buildMonthlyReport({ month, members, punches: [], leave: [request] });

  it('counts Friday to Monday as two days in both detail and summary', () => {
    const report = build('2026-09', leave('anna', 'FERIE', 'days', '2026-09-11', '2026-09-14', 2));
    expect(report.lines.map((line) => line.date)).toEqual(['2026-09-11', '2026-09-14']);
    expect(report.summaries[0].absences.FERIE).toEqual({ days: 2, hours: 0 });
    expect(summaryCsv(report, members, labels)).toContain('FERIE 2g');
    expect(detailCsv(report, members, labels)).not.toContain('12/09/2026');
  });

  it('excludes Easter Monday and weekends without changing approved quantities', () => {
    const request = leave('anna', 'FERIE', 'days', '2026-04-03', '2026-04-07', 2);
    const report = build('2026-04', request);
    expect(report.lines.map((line) => line.date)).toEqual(['2026-04-03', '2026-04-07']);
    expect(report.summaries[0].absences.FERIE.days).toBe(request.quantity);
  });

  it('splits the same approved days across months and years without double counting', () => {
    for (const [from, to, first, second] of [
      ['2026-03-30', '2026-04-02', '2026-03', '2026-04'],
      ['2026-12-30', '2027-01-05', '2026-12', '2027-01'],
    ]) {
      const request = leave('anna', 'FERIE', 'days', from, to, 4);
      const reports = [build(first, request), build(second, request)];
      expect(reports.map((r) => r.summaries[0].absences.FERIE.days)).toEqual([2, 2]);
      expect(reports.flatMap((r) => r.lines).length).toBe(4);
    }
  });

  it('preserves single-day fractional days and hours, even on a weekend', () => {
    const fractional = build('2026-09', leave('anna', 'FERIE', 'days', '2026-09-12', '2026-09-12', 0.5));
    expect(fractional.summaries[0].absences.FERIE.days).toBe(0.5);
    expect(fractional.lines[0].absences).toEqual(['FERIE 0,5g']);
    const hourly = build('2026-09', leave('anna', 'ROL', 'hours', '2026-09-12', '2026-09-12', 2.5));
    expect(hourly.summaries[0].absences.ROL.hours).toBe(2.5);
    expect(hourly.lines[0].absences).toEqual(['ROL 2,5h']);
  });

  it('blocks ambiguous historical quantities and multi-day hours rather than dropping them', () => {
    for (const request of [
      leave('anna', 'FERIE', 'days', '2026-09-11', '2026-09-14', 4),
      leave('anna', 'FERIE', 'days', '2026-09-11', '2026-09-14', 1.5),
      leave('anna', 'ROL', 'hours', '2026-09-11', '2026-09-14', 5),
      leave('anna', 'FERIE', 'days', '2026-09-12', '2026-09-13', 1),
    ]) {
      expect(() => build('2026-09', request)).toThrow(LeaveAllocationError);
      expect(request.quantity).toBeGreaterThan(0);
    }
  });

  it('blocks invalid dates, ranges and quantities', () => {
    for (const request of [
      leave('anna', 'FERIE', 'days', '2026-09-15', '2026-09-14', 1),
      leave('anna', 'FERIE', 'days', '2026-02-30', '2026-02-30', 1),
      leave('anna', 'FERIE', 'days', '2026-09-14', '2026-09-14', 0),
      leave('anna', 'FERIE', 'days', '2026-09-14', '2026-09-14', NaN),
    ]) expect(() => build('2026-09', request)).toThrow(LeaveAllocationError);
  });
});

describe('csvCell', () => {
  it('quotes delimiters and neutralises spreadsheet formulas', () => {
    expect(csvCell('Rossi; Mario')).toBe('"Rossi; Mario"');
    expect(csvCell('Detto "il Rosso"')).toBe('"Detto ""il Rosso"""');
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+39 333')).toBe("'+39 333");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(42)).toBe('42');
  });
});
