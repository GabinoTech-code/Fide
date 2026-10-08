// Block 1 · G1: the GDPR inbox. Employees file requests from the app (and keep
// that right for 12 months after leaving); HR answers within one month,
// extendable once by two months with a reason (art. 12.3). The answer is shown
// to the employee in the app.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorNotice, Modal, PageHead } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { useGdprRequests, useMembers } from '../lib/queries';
import { supabase } from '../lib/supabase';
import type { GdprRequest, GdprStatus } from '../lib/types';

const OPEN: GdprStatus[] = ['pending', 'in_progress'];

export function isOverdue(r: Pick<GdprRequest, 'status' | 'due_at'>, now = Date.now()): boolean {
  return OPEN.includes(r.status) && new Date(r.due_at).getTime() < now;
}

/** Open requests first by deadline, then closed ones, newest first. */
export function sortRequests(list: GdprRequest[]): GdprRequest[] {
  const open = list.filter((r) => OPEN.includes(r.status)).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const closed = list
    .filter((r) => !OPEN.includes(r.status))
    .sort((a, b) => (b.resolved_at ?? b.created_at).localeCompare(a.resolved_at ?? a.created_at));
  return [...open, ...closed];
}

export function PrivacyPage() {
  const { t, formatDateTime } = useI18n();
  const { data = [], isLoading, error } = useGdprRequests();
  const { data: members = [] } = useMembers();
  const [openId, setOpenId] = useState<string | null>(null);
  const byId = new Map(members.map((m) => [m.id, m]));
  const requests = sortRequests(data);
  const current = requests.find((r) => r.id === openId) ?? null;

  return (
    <>
      <PageHead title={t('privacy.title')} />
      <div className="notice">{t('privacy.intro')}</div>
      <ErrorNotice error={error} />
      <section className="card">
        {isLoading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : requests.length === 0 ? (
          <p className="empty">{t('privacy.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('privacy.received')}</th>
                  <th>{t('employees.fullName')}</th>
                  <th>{t('privacy.kind')}</th>
                  <th>{t('privacy.due')}</th>
                  <th>{t('employees.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const overdue = isOverdue(r);
                  return (
                    <tr key={r.id}>
                      <td className="small">{formatDateTime(r.created_at, { dateStyle: 'medium' })}</td>
                      <td style={{ fontWeight: 600 }}>{byId.get(r.member_id)?.full_name ?? '—'}</td>
                      <td className="small">{t(`privacy.kind.${r.kind}` as MessageKey)}</td>
                      <td className="small">
                        {OPEN.includes(r.status) ? (
                          <span className={`badge ${overdue ? 'badge-danger' : 'badge-warn'}`}>
                            {overdue ? t('privacy.overdue') : formatDateTime(r.due_at, { dateStyle: 'medium' })}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className={`badge ${OPEN.includes(r.status) ? '' : 'badge-muted'}`}>
                          {t(`privacy.status.${r.status}` as MessageKey)}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-sm" onClick={() => setOpenId(r.id)}>
                          {t(OPEN.includes(r.status) ? 'privacy.answer' : 'privacy.view')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {current ? (
        <RequestPanel
          request={current}
          memberName={byId.get(current.member_id)?.full_name ?? ''}
          memberTerminated={byId.get(current.member_id)?.status === 'terminated'}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}

function RequestPanel({
  request,
  memberName,
  memberTerminated,
  onClose,
}: {
  request: GdprRequest;
  memberName: string;
  memberTerminated: boolean;
  onClose: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState(request.resolution_note ?? '');
  const [extension, setExtension] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const open = OPEN.includes(request.status);

  const run = async (fn: string, args: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) return setError(error);
    await queryClient.invalidateQueries({ queryKey: ['gdpr'] });
  };
  const resolve = (status: GdprStatus) => run('resolve_gdpr_request', { p_request_id: request.id, p_status: status, p_note: answer.trim() || null });

  return (
    <Modal title={t('privacy.panelTitle', { kind: t(`privacy.kind.${request.kind}` as MessageKey), name: memberName })} onClose={onClose} wide>
      <div className="stack" style={{ gap: 6 }}>
        <div className="small muted">
          {t('privacy.receivedOn', { when: formatDateTime(request.created_at) })}
          {' · '}
          {t('privacy.dueOn', { when: formatDateTime(request.due_at, { dateStyle: 'long' }) })}
          {request.extended_at ? ` · ${t('privacy.extended')}` : ''}
        </div>
        {request.details ? <blockquote className="quote">{request.details}</blockquote> : null}
        <div className="notice">{t(`privacy.guide.${request.kind}` as MessageKey)}</div>
        {request.extension_note ? <p className="small muted">{t('privacy.extensionNote', { note: request.extension_note })}</p> : null}
      </div>

      {open ? (
        <div className="stack">
          <label className="field">
            {t('privacy.answerLabel')}
            <textarea rows={5} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <small className="muted">{t('privacy.answerHint')}</small>
          </label>
          {request.kind === 'erasure' ? (
            <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAnswer(t('privacy.template.erasureRetention'))}>
              {t('privacy.useTemplate')}
            </button>
          ) : null}
          <ErrorNotice error={error} />
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {request.status === 'pending' ? (
              <button className="btn" disabled={busy} onClick={() => resolve('in_progress')}>
                {t('privacy.takeOn')}
              </button>
            ) : null}
            <span className="spacer" />
            <button className="btn btn-danger" disabled={busy || answer.trim().length < 3} onClick={() => resolve('rejected')}>
              {t('privacy.reject')}
            </button>
            <button className="btn btn-primary" disabled={busy || answer.trim().length < 3} onClick={() => resolve('completed')}>
              {t('privacy.complete')}
            </button>
          </div>

          {request.kind === 'erasure' && memberTerminated ? (
            <div className="subcard stack">
              <p className="small">{t('privacy.eraseFormerExplain')}</p>
              <button
                className="btn btn-danger"
                style={{ alignSelf: 'flex-start' }}
                disabled={busy || answer.trim().length < 3}
                onClick={() => run('gdpr_erase_former_member', { p_request_id: request.id, p_note: answer.trim() })}
              >
                {t('privacy.eraseFormer')}
              </button>
            </div>
          ) : null}

          {!request.extended_at ? (
            <div className="subcard stack">
              <p className="small">{t('privacy.extendExplain')}</p>
              <div className="row">
                <input style={{ flex: 1 }} maxLength={2000} value={extension} onChange={(e) => setExtension(e.target.value)} placeholder={t('privacy.extendPlaceholder')} />
                <button
                  className="btn"
                  disabled={busy || extension.trim().length < 3}
                  onClick={() => run('extend_gdpr_request', { p_request_id: request.id, p_note: extension.trim() })}
                >
                  {t('privacy.extend')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="stack">
          <h3>{t('privacy.answerLabel')}</h3>
          <p>{request.resolution_note}</p>
          {request.resolved_at ? <p className="small muted">{formatDateTime(request.resolved_at)}</p> : null}
        </div>
      )}
    </Modal>
  );
}
