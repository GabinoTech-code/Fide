import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Brand';
import { ErrorNotice, PageHead } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { useMemberNames, usePendingCorrections, usePendingLeave } from '../lib/queries';
import { supabase } from '../lib/supabase';

export function RequestsPage() {
  const { t, formatDateTime } = useI18n();
  const names = useMemberNames();
  const leave = usePendingLeave();
  const corrections = usePendingCorrections();
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);

  const decide = async (fn: 'decide_leave_request' | 'decide_punch_correction', id: string, approve: boolean) => {
    const args = fn === 'decide_leave_request' ? { p_request_id: id, p_approve: approve } : { p_correction_id: id, p_approve: approve };
    const { error } = await supabase.rpc(fn, args);
    setError(error);
    await queryClient.invalidateQueries({ queryKey: [fn === 'decide_leave_request' ? 'leave' : 'corrections'] });
  };

  const Actions = ({ fn, id }: { fn: 'decide_leave_request' | 'decide_punch_correction'; id: string }) => (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn btn-sm btn-primary" onClick={() => decide(fn, id, true)}>
        {t('requests.approve')}
      </button>
      <button className="btn btn-sm" onClick={() => decide(fn, id, false)}>
        {t('requests.reject')}
      </button>
    </div>
  );

  return (
    <>
      <PageHead title={t('requests.title')} />
      <ErrorNotice error={error ?? leave.error ?? corrections.error} />
      <section className="card stack">
        <h2 className="row">
          <Icon name="vacaciones" /> {t('requests.leave')}
        </h2>
        {(leave.data ?? []).length === 0 ? (
          <p className="empty">{t('requests.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('presence.employee')}</th>
                  <th>{t('payroll.kind')}</th>
                  <th>{t('requests.period')}</th>
                  <th>{t('requests.quantity')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leave.data!.map((r) => (
                  <tr key={r.id}>
                    <td>{names.get(r.member_id)}</td>
                    <td>{r.leave_types?.name}</td>
                    <td className="mono">
                      {r.start_date}
                      {r.end_date !== r.start_date ? ` → ${r.end_date}` : ''}
                    </td>
                    <td className="mono">
                      {r.quantity} {r.leave_types?.unit === 'hours' ? 'h' : 'gg'}
                    </td>
                    <td>
                      <Actions fn="decide_leave_request" id={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card stack">
        <h2 className="row">
          <Icon name="olvidado" /> {t('requests.corrections')}
        </h2>
        {(corrections.data ?? []).length === 0 ? (
          <p className="empty">{t('requests.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('presence.employee')}</th>
                  <th />
                  <th>{t('presence.time')}</th>
                  <th>{t('requests.reason')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {corrections.data!.map((c) => (
                  <tr key={c.id}>
                    <td>{names.get(c.member_id)}</td>
                    <td>{t(c.punch_type === 'in' ? 'presence.in' : 'presence.out')}</td>
                    <td className="mono">{formatDateTime(c.requested_ts)}</td>
                    <td className="small">{c.reason}</td>
                    <td>
                      <Actions fn="decide_punch_correction" id={c.id} />
                    </td>
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
