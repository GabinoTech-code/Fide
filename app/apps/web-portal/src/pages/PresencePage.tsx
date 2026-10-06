import { Icon } from '../components/Brand';
import { ErrorNotice, PageHead } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { useMemberNames, useTodayPunches } from '../lib/queries';
import type { Punch } from '../lib/types';

/** Members whose latest punch today is an "in". */
function inNow(punches: Punch[]): Set<string> {
  const latest = new Map<string, Punch>();
  for (const p of punches) {
    const seen = latest.get(p.member_id);
    if (!seen || seen.device_ts < p.device_ts) latest.set(p.member_id, p);
  }
  return new Set([...latest.values()].filter((p) => p.punch_type === 'in').map((p) => p.member_id));
}

export function PresencePage() {
  const { t, formatDateTime } = useI18n();
  const names = useMemberNames();
  const { data: punches = [], isLoading, error } = useTodayPunches();
  const present = inNow(punches);
  const flagged = punches.filter((p) => p.flags.length > 0).length;

  return (
    <>
      <PageHead
        title={t('presence.title')}
        eyebrow={
          <span className="row" style={{ gap: 8 }}>
            <span className="live-dot" /> {t('presence.live')}
          </span>
        }
      />
      <ErrorNotice error={error} />
      <div className="grid-3">
        <div className="card stat">
          <span className="muted small">{t('presence.inNow')}</span>
          <span className="stat-value">{present.size}</span>
          <span className="small muted">{[...present].map((id) => names.get(id)).filter(Boolean).join(', ') || '—'}</span>
        </div>
        <div className="card stat">
          <span className="muted small">{t('presence.today')}</span>
          <span className="stat-value">{punches.length}</span>
        </div>
        <div className="card stat">
          <span className="muted small">{t('presence.flags')}</span>
          <span className="stat-value" style={{ color: flagged ? 'var(--amber)' : undefined }}>
            {flagged}
          </span>
        </div>
      </div>

      <section className="card stack">
        <h2>{t('presence.today')}</h2>
        {isLoading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : punches.length === 0 ? (
          <p className="empty">{t('presence.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('presence.time')}</th>
                  <th>{t('presence.employee')}</th>
                  <th />
                  <th>{t('presence.method')}</th>
                  <th>{t('presence.flags')}</th>
                  <th>{t('presence.receipt')}</th>
                </tr>
              </thead>
              <tbody>
                {punches.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{formatDateTime(p.device_ts, { timeStyle: 'short' })}</td>
                    <td>{names.get(p.member_id) ?? '—'}</td>
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
                          <span key={f} className="badge badge-warn">
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
      </section>
    </>
  );
}
