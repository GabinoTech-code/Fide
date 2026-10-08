// Monthly attendance export for the consulente del lavoro (lib/monthlyReport.ts).
// Data is read with HR's own session (RLS) and the files are built here.
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useI18n, type MessageKey } from '../lib/i18n';
import {
  buildMonthlyReport,
  daysOf,
  detailCsv,
  fetchWindow,
  summaryCsv,
  type Anomaly,
  type ReportLabels,
  type ReportLeave,
  type ReportMember,
  type ReportPunch,
} from '../lib/monthlyReport';
import { defaultPeriod } from '../lib/payroll';
import { useMembers } from '../lib/queries';
import { supabase } from '../lib/supabase';
import { ErrorNotice } from './ui';

/** PostgREST caps responses (1000 rows by default): read page by page. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Ready {
  month: string;
  detail: string;
  summary: string;
  employees: number;
  lines: number;
  anomalies: number;
}

export function MonthlyReport() {
  const { t } = useI18n();
  const { active } = useAuth();
  const { data: members = [], isSuccess } = useMembers();
  const [month, setMonth] = useState(defaultPeriod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [ready, setReady] = useState<Ready | null>(null);

  const labels: ReportLabels = {
    detailHeader: (['number', 'cf', 'employee', 'date', 'intervals', 'hours', 'hundredths', 'absences', 'anomalies'] as const).map((c) =>
      t(`report.col.${c}` as MessageKey),
    ),
    summaryHeader: (['number', 'cf', 'employee', 'days', 'hours', 'hundredths', 'absences', 'anomalyCount'] as const).map((c) =>
      t(`report.col.${c}` as MessageKey),
    ),
    dayUnit: t('report.dayUnit'),
    anomaly: (a: Anomaly) => t(`report.anomaly.${a}` as MessageKey),
  };

  async function prepare() {
    if (!active) return;
    setBusy(true);
    setError(null);
    setReady(null);
    try {
      const companyId = active.company_id;
      const { from, to } = fetchWindow(month);
      const days = daysOf(month);
      const [punches, leave] = await Promise.all([
        allRows<ReportPunch>((a, b) =>
          supabase
            .from('punches')
            .select('member_id, punch_type, method, device_ts, flags')
            .eq('company_id', companyId)
            .gte('device_ts', from)
            .lt('device_ts', to)
            .order('device_ts')
            .order('id')
            .range(a, b),
        ),
        allRows<ReportLeave>((a, b) =>
          supabase
            .from('leave_requests')
            .select('member_id, start_date, end_date, quantity, leave_types(code, unit)')
            .eq('company_id', companyId)
            .eq('status', 'approved')
            .lte('start_date', days.at(-1)!)
            .gte('end_date', days[0])
            .order('start_date')
            .order('id')
            .range(a, b),
        ),
      ]);

      const withData = new Set([...punches.map((p) => p.member_id), ...leave.map((l) => l.member_id)]);
      const people: ReportMember[] = members
        .filter((m) => m.status === 'active' || m.status === 'suspended' || withData.has(m.id))
        .map((m) => {
          const identity = Array.isArray(m.member_identities) ? m.member_identities[0] : m.member_identities;
          return { id: m.id, full_name: m.full_name, employee_number: m.employee_number, codice_fiscale: identity?.codice_fiscale ?? null };
        })
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'it'));

      const report = buildMonthlyReport({ month, members: people, punches, leave });
      setReady({
        month,
        detail: detailCsv(report, people, labels),
        summary: summaryCsv(report, people, labels),
        employees: people.length,
        lines: report.lines.length,
        anomalies: report.summaries.reduce((sum, s) => sum + s.anomalies, 0),
      });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>{t('report.title')}</h2>
      <p className="small muted">{t('report.body')}</p>
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field">
          {t('report.month')}
          <input
            type="month"
            required
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setReady(null);
            }}
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !month || !isSuccess} onClick={prepare}>
          {busy ? t('report.loading') : t('report.prepare')}
        </button>
      </div>
      <ErrorNotice error={error} />
      {ready ? (
        ready.lines === 0 ? (
          <p className="empty">{t('report.empty')}</p>
        ) : (
          <div className="stack">
            <span className="small" role="status">
              {t('report.ready', { employees: ready.employees, lines: ready.lines })}
            </span>
            {ready.anomalies ? <div className="notice notice-warn">{t('report.anomalies', { n: ready.anomalies })}</div> : null}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => download(`fide-presenze-${ready.month}-dettaglio.csv`, ready.detail)}>
                {t('report.detail')}
              </button>
              <button className="btn" onClick={() => download(`fide-presenze-${ready.month}-riepilogo.csv`, ready.summary)}>
                {t('report.summary')}
              </button>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}
