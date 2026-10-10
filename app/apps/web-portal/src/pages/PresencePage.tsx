import { Icon } from '../components/Brand';
import { useEffect, useState } from 'react';
import { romeDate } from '@fide/shared';
import { useAuth } from '../auth/AuthProvider';
import { MonthlyReport } from '../components/MonthlyReport';
import { ErrorNotice, PageHead } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { useMembers, useSites, useTodayPunches } from '../lib/queries';
import { filterPresence, needsReview, type PresenceFilters } from '../lib/presenceView';

export function PresencePage() {
  const { t, formatDateTime } = useI18n();
  const { isHr } = useAuth();
  const members = useMembers();
  const sites = useSites();
  const names = new Map((members.data ?? []).map((m) => [m.id, m.full_name]));
  const [today, setToday] = useState(() => romeDate(new Date()));
  const [selectedDay, setSelectedDay] = useState('');
  const day = selectedDay || today;
  useEffect(() => {
    const timer = setInterval(() => setToday(romeDate(new Date())), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [filters, setFilters] = useState<PresenceFilters>({ search: '', site: '', manager: '', kind: '' });
  const [page, setPage] = useState(0);
  const change = (next: Partial<PresenceFilters>) => { setFilters((old) => ({ ...old, ...next })); setPage(0); };
  const { data: punches = [], isLoading, error } = useTodayPunches(day);
  const filtered = filterPresence(punches, members.data ?? [], filters);
  const present = new Set(filtered.map((p) => p.member_id));
  const flagged = filtered.filter(needsReview).length;
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * 50, (currentPage + 1) * 50);
  const failed = error ?? members.error ?? sites.error;
  const loading = isLoading || members.isLoading || sites.isLoading;
  const complete = !failed && !loading;

  return (
    <>
      <PageHead
        title={t('presence.title')}
        eyebrow={
          <span className="row" style={{ gap: 8 }}>
            <span className="live-dot" /> {day === today ? t('presence.live') : day}
          </span>
        }
      />
      <ErrorNotice error={failed} />
      <section className="card stack">
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
          <label className="field">{t('presence.date')}<input type="date" value={day} max={today} onChange={(e) => { setSelectedDay(e.target.value); setPage(0); }} /></label>
          <button className="btn" onClick={() => { setSelectedDay(''); setPage(0); }}>{t('presence.resetToday')}</button>
          <label className="field">{t('presence.search')}<input type="search" value={filters.search} onChange={(e) => change({ search: e.target.value })} /></label>
          <label className="field">{t('presence.siteFilter')}<select value={filters.site} onChange={(e) => change({ site: e.target.value })}>
            <option value="">{t('presence.all')}</option>
            {(sites.data ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select></label>
          <label className="field">{t('presence.managerFilter')}<select value={filters.manager} onChange={(e) => change({ manager: e.target.value })}>
            <option value="">{t('presence.all')}</option>
            {(members.data ?? []).filter((m) => (members.data ?? []).some((worker) => worker.manager_member_id === m.id)).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select></label>
          <label className="field">{t('presence.kindFilter')}<select value={filters.kind} onChange={(e) => change({ kind: e.target.value as PresenceFilters['kind'] })}>
            <option value="">{t('presence.all')}</option><option value="in">{t('presence.in')}</option><option value="out">{t('presence.out')}</option><option value="review">{t('presence.review')}</option>
          </select></label>
        </div>
        <p className="small muted">{t('presence.scope', { filtered: complete ? filtered.length : '—', total: complete ? punches.length : '—' })}</p>
      </section>
      <div className="grid-3">
        <div className="card stat">
          <span className="muted small">{t('presence.lastIn')}</span>
          <span className="stat-value">{complete ? present.size : '—'}</span>
          <span className="small muted">{t('presence.lastInHint')}</span>
        </div>
        <div className="card stat">
          <span className="muted small">{t('presence.dayPunches')}</span>
          <span className="stat-value">{complete ? filtered.length : '—'}</span>
        </div>
        <div className="card stat">
          <span className="muted small">{t('presence.review')}</span>
          <span className="stat-value" style={{ color: flagged ? 'var(--amber)' : undefined }}>
            {complete ? flagged : '—'}
          </span>
        </div>
      </div>

      <section className="card stack">
        <h2>{t('presence.dayPunches')} · {day}</h2>
        {loading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : failed ? null : filtered.length === 0 ? (
          <p className="empty">{t('presence.noMatches')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('presence.time')}</th>
                  <th>{t('presence.employee')}</th>
                  <th>{t('presence.siteFilter')}</th>
                  <th />
                  <th>{t('presence.method')}</th>
                  <th>{t('presence.flags')}</th>
                  <th>{t('presence.receipt')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{formatDateTime(p.device_ts, { timeStyle: 'short' })}</td>
                    <td>{names.get(p.member_id) ?? '—'}</td>
                    <td>{sites.data?.find((site) => site.id === p.site_id)?.name ?? '—'}</td>
                    <td>
                      <span className={`badge ${p.punch_type === 'in' ? '' : 'badge-muted'}`}>
                        <Icon name={p.punch_type === 'in' ? 'entrada' : 'salida'} size={16} />
                        {t(p.punch_type === 'in' ? 'presence.in' : 'presence.out')}
                      </span>
                    </td>
                    <td className="small">{t(`method.${p.method}` as MessageKey)}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {p.flags.map((f) => (
                          <span key={f} className={`badge ${f === 'hr_entry' || f === 'manual_correction' ? 'badge-muted' : 'badge-warn'}`}>
                            {t(`flag.${f}` as MessageKey)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="mono muted">{p.receipt_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {complete && filtered.length > 0 ? <nav className="row" aria-label={t('presence.pagination')}>
          <button className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('presence.previous')}</button>
          <span>{t('presence.page', { page: currentPage + 1, pages })}</span>
          <button className="btn" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>{t('presence.next')}</button>
        </nav> : null}
      </section>

      {/* The consultant's report is HR's work; a team manager sees today's presence only. */}
      {isHr ? <MonthlyReport /> : null}
    </>
  );
}
