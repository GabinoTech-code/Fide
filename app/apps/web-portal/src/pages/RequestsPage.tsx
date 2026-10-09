import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Brand';
import { ErrorNotice, Modal, PageHead } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { useMemberNames, usePendingCorrections, usePendingLeave, useRequestHistory } from '../lib/queries';
import { filterHistory, mergeHistory, type HistoryFilter, type HistoryItem } from '../lib/requestHistory';
import { supabase } from '../lib/supabase';

type DecideFn = 'decide_leave_request' | 'decide_punch_correction';
interface Pending {
  fn: DecideFn;
  id: string;
  approve: boolean;
  who: string;
}

export function RequestsPage() {
  const { t } = useI18n();
  const leave = usePendingLeave();
  const corrections = usePendingCorrections();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const open = (leave.data?.length ?? 0) + (corrections.data?.length ?? 0);

  return (
    <>
      <PageHead title={t('requests.title')} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'pending'} className={`tab${tab === 'pending' ? ' tab-active' : ''}`} onClick={() => setTab('pending')}>
          {t('requests.tabPending', { n: open })}
        </button>
        <button role="tab" aria-selected={tab === 'history'} className={`tab${tab === 'history' ? ' tab-active' : ''}`} onClick={() => setTab('history')}>
          {t('requests.tabHistory')}
        </button>
      </div>
      {tab === 'pending' ? <PendingRequests /> : <RequestHistory />}
    </>
  );
}

function PendingRequests() {
  const { t, formatDateTime } = useI18n();
  const names = useMemberNames();
  const leave = usePendingLeave();
  const corrections = usePendingCorrections();
  const [deciding, setDeciding] = useState<Pending | null>(null);

  const Actions = ({ fn, id, memberId }: { fn: DecideFn; id: string; memberId: string }) => (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn btn-sm btn-primary" onClick={() => setDeciding({ fn, id, approve: true, who: names.get(memberId) ?? '' })}>
        {t('requests.approve')}
      </button>
      <button className="btn btn-sm" onClick={() => setDeciding({ fn, id, approve: false, who: names.get(memberId) ?? '' })}>
        {t('requests.reject')}
      </button>
    </div>
  );

  return (
    <>
      <ErrorNotice error={leave.error ?? corrections.error} />
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
                    <td>
                      {r.leave_types?.name}
                      {r.note ? <div className="small muted">{r.note}</div> : null}
                    </td>
                    <td className="mono">
                      {r.start_date}
                      {r.end_date !== r.start_date ? ` → ${r.end_date}` : ''}
                    </td>
                    <td className="mono">
                      {r.quantity} {r.leave_types?.unit === 'hours' ? 'h' : 'gg'}
                    </td>
                    <td>
                      <Actions fn="decide_leave_request" id={r.id} memberId={r.member_id} />
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
                      <Actions fn="decide_punch_correction" id={c.id} memberId={c.member_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {deciding ? <DecideRequest pending={deciding} onClose={() => setDeciding(null)} /> : null}
    </>
  );
}

/** Approve or reject with a note the employee reads in the app (audit V3); a rejection needs one. */
function DecideRequest({ pending, onClose }: { pending: Pending; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const noteRequired = !pending.approve;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const key = pending.fn === 'decide_leave_request' ? 'p_request_id' : 'p_correction_id';
    const { error } = await supabase.rpc(pending.fn, { [key]: pending.id, p_approve: pending.approve, p_note: note.trim() || null });
    setBusy(false);
    if (error) return setError(error);
    await Promise.all(
      ['leave', 'corrections', 'requestHistory'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    );
    onClose();
  };

  return (
    <Modal title={t(pending.approve ? 'requests.approveTitle' : 'requests.rejectTitle', { name: pending.who })} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          {t(noteRequired ? 'requests.noteRequired' : 'requests.noteOptional')}
          <textarea rows={3} maxLength={500} required={noteRequired} minLength={noteRequired ? 3 : undefined} value={note} onChange={(e) => setNote(e.target.value)} />
          <small className="muted">{t('requests.noteHint')}</small>
        </label>
        <ErrorNotice error={error} />
        <div className="row">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className={`btn ${pending.approve ? 'btn-primary' : 'btn-danger'}`} disabled={busy || (noteRequired && note.trim().length < 3)}>
            {t(pending.approve ? 'requests.approve' : 'requests.reject')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const BADGE: Record<HistoryItem['status'], string> = { approved: '', rejected: 'badge-danger', cancelled: 'badge-muted' };

function RequestHistory() {
  const { t, formatDateTime } = useI18n();
  const names = useMemberNames();
  const history = useRequestHistory();
  const [filter, setFilter] = useState<HistoryFilter>({ kind: 'all', status: 'all', query: '' });
  const items = useMemo(
    () => (history.data ? mergeHistory(history.data.leave, history.data.corrections) : []),
    [history.data],
  );
  const shown = filterHistory(items, filter, names);
  const date = (iso: string) => formatDateTime(`${iso}T12:00:00Z`, { dateStyle: 'medium' });

  return (
    <section className="card stack">
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <select value={filter.kind} onChange={(e) => setFilter((f) => ({ ...f, kind: e.target.value as HistoryFilter['kind'] }))} aria-label={t('payroll.kind')}>
          <option value="all">{t('requests.filterAllKinds')}</option>
          <option value="leave">{t('requests.leave')}</option>
          <option value="correction">{t('requests.corrections')}</option>
        </select>
        <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as HistoryFilter['status'] }))} aria-label={t('requests.outcome')}>
          <option value="all">{t('requests.filterAllOutcomes')}</option>
          <option value="approved">{t('requests.status.approved')}</option>
          <option value="rejected">{t('requests.status.rejected')}</option>
          <option value="cancelled">{t('requests.status.cancelled')}</option>
        </select>
        <input
          type="search"
          style={{ flex: 1, minWidth: 180 }}
          placeholder={t('requests.searchPerson')}
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
        />
      </div>
      <ErrorNotice error={history.error} />
      {history.isLoading ? (
        <p className="muted">{t('common.loading')}</p>
      ) : shown.length === 0 ? (
        <p className="empty">{t('requests.historyEmpty')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('presence.employee')}</th>
                <th>{t('payroll.kind')}</th>
                <th>{t('requests.period')}</th>
                <th>{t('requests.outcome')}</th>
                <th>{t('requests.decidedBy')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={`${i.kind}-${i.id}`}>
                  <td>{names.get(i.memberId) ?? '—'}</td>
                  <td>
                    {i.kind === 'leave' ? i.label : t(i.label === 'in' ? 'presence.in' : 'presence.out')}
                    {i.enteredByHr ? <div><span className="badge badge-muted">{t('requests.byHr')}</span></div> : null}
                    {i.reason ? <div className="small muted">{i.reason}</div> : null}
                  </td>
                  <td className="mono small">
                    {i.kind === 'leave' ? (
                      <>
                        {date(i.start)}
                        {i.end ? ` → ${date(i.end)}` : ''}
                        {i.quantity !== null ? ` · ${i.quantity} ${i.unit === 'hours' ? 'h' : 'gg'}` : ''}
                      </>
                    ) : (
                      formatDateTime(i.start)
                    )}
                  </td>
                  <td>
                    <span className={`badge ${BADGE[i.status]}`}>{t(`requests.status.${i.status}` as MessageKey)}</span>
                    {i.note ? <div className="small">{i.note}</div> : null}
                  </td>
                  <td className="small">
                    {i.decidedBy ? names.get(i.decidedBy) ?? '—' : '—'}
                    {i.decidedAt ? <div className="muted">{formatDateTime(i.decidedAt)}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">{t('requests.historyLimit')}</p>
    </section>
  );
}
