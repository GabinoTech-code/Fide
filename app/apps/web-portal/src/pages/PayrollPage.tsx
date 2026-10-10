// Payslips: HR drops the bulk PDF from the payroll software; this browser splits
// it per employee, encrypts each part to the employee's phone and uploads
// ciphertext only (lib/payroll.ts). Fide never sees a payslip in clear.
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { splitPayroll, type SplitResult } from '@fide/payroll-parser';
import { useAuth } from '../auth/AuthProvider';
import { ErrorNotice, Modal, PageHead } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { loadPinnedDevices, pinDevices, type PinnedDevices } from '../lib/deviceTrust';
import {
  assignableMembers,
  allReviewPagesChecked,
  cutPdf,
  defaultPeriod,
  encryptForRecipient,
  knownEmployees,
  pageRanges,
  planRecipients,
  sendBatch,
  needsReview,
  unassignedPages,
  willSend,
  type BatchBackend,
  type DocumentKind,
  type PreparedBatch,
  type PublishedDoc,
  type Recipient,
  type RecipientState,
} from '../lib/payroll';
import { extractPageTexts, loadSplittable } from '../lib/pdfText';
import { useMemberNames, useMembers, usePayrollBatches } from '../lib/queries';
import { getSodium } from '../lib/sodium';
import { supabase } from '../lib/supabase';
import type { BatchDocument } from '../lib/types';

const KINDS: DocumentKind[] = ['cedolino', 'cu', 'other'];

const BADGE: Record<RecipientState, string> = {
  ready: '',
  reissue: 'badge-warn',
  delivered: 'badge-muted',
  no_key: 'badge-muted',
  key_changed: 'badge-warn',
  key_mismatch: 'badge-danger',
};

interface Analysis {
  fileName: string;
  source: Uint8Array;
  split: SplitResult;
  published: PublishedDoc[];
  kind: DocumentKind;
  /** YYYY-MM-01 */
  period: string;
  title: string;
}

type Work = { phase: 'encrypting' | 'uploading' | 'publishing'; done: number; total: number };

/** A batch that failed half-way, kept so "retry" resumes it, plus the keys it was encrypted to. */
interface Pending {
  batch: PreparedBatch;
  trust: PinnedDevices;
}

const backend: BatchBackend = {
  async createBatch(b) {
    const { data, error } = await supabase.rpc('create_payroll_batch', {
      p_company_id: b.companyId,
      p_kind: b.kind,
      p_period: b.period,
      p_title: b.title,
      p_items: b.documents.map((d) => d.item),
    });
    if (error) throw error;
    return data as string;
  },
  async upload(path, ciphertext) {
    const body = new Blob([ciphertext as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' });
    const { error } = await supabase.storage
      .from('encrypted-documents')
      .upload(path, body, { contentType: 'application/octet-stream', upsert: false });
    if (!error) return 'uploaded';
    // A previous attempt stored it; publish_payroll_batch re-checks the size.
    if (/already exists/i.test(error.message) || (error as { statusCode?: string }).statusCode === '409') return 'exists';
    throw error;
  },
  async publish(batchId) {
    const { data, error } = await supabase.rpc('publish_payroll_batch', { p_batch_id: batchId });
    if (error) throw error;
    return data as number;
  },
};

export function PayrollPage() {
  const { active } = useAuth();
  // A new company means a new trust store and no half-done batch from the old one.
  return <PayrollWorkspace key={active?.company_id ?? ''} companyId={active?.company_id ?? ''} />;
}

function PayrollWorkspace({ companyId }: { companyId: string }) {
  const { t, formatDateTime } = useI18n();
  const queryClient = useQueryClient();
  const membersQuery = useMembers();
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  const [kind, setKind] = useState<DocumentKind>('cedolino');
  const [period, setPeriod] = useState(defaultPeriod);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [manual, setManual] = useState<Record<number, string>>({});
  // Each uncertain source page is checked against the exact recipient selected for it.
  const [reviewedPages, setReviewedPages] = useState<Record<number, string>>({});
  const [resend, setResend] = useState<ReadonlySet<string>>(new Set());
  const [trust, setTrust] = useState(() => loadPinnedDevices(companyId));
  const [verifying, setVerifying] = useState<Recipient | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<number | null>(null);

  const periodLabel = period ? formatDateTime(`${period}-01T12:00:00Z`, { month: 'long', year: 'numeric' }) : '';
  const defaultTitle = `${t(`kind.${kind}` as MessageKey)} ${periodLabel}`.trim();

  const recipients = useMemo(
    () => (analysis ? planRecipients({ split: analysis.split, members, published: analysis.published, pinned: trust.devices, manual }) : []),
    [analysis, members, trust.devices, manual],
  );
  const sending = recipients.filter((r) => willSend(r, resend));
  const toReview = needsReview(recipients, resend);
  const sourcePdfUrl = useMemo(
    () => (analysis ? URL.createObjectURL(new Blob([analysis.source.slice().buffer as ArrayBuffer], { type: 'application/pdf' })) : null),
    [analysis],
  );
  useEffect(() => () => {
    if (sourcePdfUrl) URL.revokeObjectURL(sourcePdfUrl);
  }, [sourcePdfUrl]);
  const reviewComplete = allReviewPagesChecked(toReview, reviewedPages);
  const skipped = analysis ? unassignedPages(analysis.split, manual) : [];
  const assignable = useMemo(() => assignableMembers(members), [members]);

  function remember(entries: PinnedDevices) {
    setTrust((current) => ({ ...current, devices: pinDevices(companyId, entries, current.devices) }));
  }

  function reset() {
    setAnalysis(null);
    setPending(null);
    setManual({});
    setReviewedPages({});
    setResend(new Set());
    setFile(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function analyze(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    setDone(null);
    try {
      const source = new Uint8Array(await file.arrayBuffer());
      const periodDate = `${period}-01`;
      const [texts, company, published] = await Promise.all([
        extractPageTexts(source),
        supabase.from('companies').select('vat_number, fiscal_code').eq('id', companyId).single(),
        supabase
          .from('documents')
          .select('id, member_id, device_key_id, published_at')
          .eq('company_id', companyId)
          .eq('kind', kind)
          .eq('period', periodDate)
          .eq('status', 'published'),
      ]);
      if (company.error) throw company.error;
      if (published.error) throw published.error;
      await loadSplittable(source);
      const employerCodes = [company.data.vat_number, company.data.fiscal_code].filter((c): c is string => Boolean(c));
      setAnalysis({
        fileName: file.name,
        source,
        split: splitPayroll(texts, knownEmployees(members), { employerCodes }),
        published: (published.data ?? []) as PublishedDoc[],
        kind,
        period: periodDate,
        title: title.trim() || defaultTitle,
      });
      setManual({});
      setReviewedPages({});
      setResend(new Set());
    } catch (err) {
      setError(err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function prepare(a: Analysis): Promise<Pending> {
    const sodium = await getSodium();
    const source = await loadSplittable(a.source);
    const documents = [];
    const used: PinnedDevices = {};
    const pinnedAt = new Date().toISOString();
    for (const [i, r] of sending.entries()) {
      setWork({ phase: 'encrypting', done: i, total: sending.length });
      const plaintext = await cutPdf(source, r.pages, a.title);
      documents.push(encryptForRecipient(sodium, { companyId, recipient: r, documentId: crypto.randomUUID(), plaintext, resend }));
      plaintext.fill(0);
      if (r.key && r.trust && r.trust.kind !== 'mismatch') used[r.memberId] = { deviceKeyId: r.key.id, fingerprint: r.trust.fingerprint, pinnedAt };
    }
    return {
      batch: { companyId, kind: a.kind, period: a.period, title: a.title, documents, batchId: null, uploaded: new Set() },
      trust: used,
    };
  }

  async function publish() {
    if (!analysis) return;
    setError(null);
    let job = pending;
    try {
      job ??= await prepare(analysis);
      setPending(job);
      const count = await sendBatch(job.batch, backend, setWork);
      remember(job.trust);
      reset();
      setDone(count);
    } catch (err) {
      setError(err);
      // Nothing was stored server-side yet: the next attempt re-plans from fresh data
      // (e.g. an employee changed phone in the meantime).
      if (!job?.batch.batchId) setPending(null);
      await queryClient.invalidateQueries({ queryKey: ['members'] });
    } finally {
      setWork(null);
      await queryClient.invalidateQueries({ queryKey: ['payroll'] });
    }
  }

  const locked = Boolean(analysis) || analyzing;

  return (
    <>
      <PageHead title={t('payroll.title')} />
      <div className="notice">{t('payroll.privacy')}</div>
      {!trust.persistent ? <div className="notice notice-warn">{t('payroll.trustUnavailable')}</div> : null}
      {done !== null ? (
        <div className="notice" role="status">
          {t('payroll.done', { n: done })}
        </div>
      ) : null}

      <section className="card stack">
        <h2>{t('payroll.new')}</h2>
        <form className="stack" onSubmit={analyze}>
          <div className="grid-3">
            <label className="field">
              {t('payroll.kind')}
              <select value={kind} disabled={locked} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind.${k}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('payroll.period')}
              <input type="month" required value={period} disabled={locked} onChange={(e) => setPeriod(e.target.value)} />
            </label>
            <label className="field">
              {t('payroll.docTitle')}
              <input value={title} placeholder={defaultTitle} maxLength={120} disabled={locked} onChange={(e) => setTitle(e.target.value)} />
            </label>
          </div>
          <label className="field">
            {t('payroll.file')}
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              required
              disabled={locked}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="row">
            {analysis ? (
              <button type="button" className="btn" onClick={reset} disabled={Boolean(work)}>
                {t('payroll.reset')}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={!file || analyzing || !membersQuery.isSuccess}>
                {analyzing ? t('payroll.analyzing') : t('payroll.analyze')}
              </button>
            )}
          </div>
        </form>
        {!analysis ? <ErrorNotice error={error} /> : null}
      </section>

      {analysis ? (
        <section className="card stack">
          <div className="row">
            <h2>{t('payroll.recipients')}</h2>
            <span className="spacer" />
            <span className="small muted">
              {analysis.fileName} · {t('payroll.pages', { n: analysis.split.pageCount })}
            </span>
          </div>

          {recipients.length === 0 ? (
            <p className="empty">{t('payroll.nothingToSend')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('employees.fullName')}</th>
                    <th>{t('payroll.pagesCol')}</th>
                    <th>{t('employees.device')}</th>
                    <th>{t('employees.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.memberId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.fullName}</div>
                        <div className="mono muted" style={{ fontSize: 12 }}>
                          {r.codiceFiscale}
                        </div>
                      </td>
                      <td>
                        <div className="mono">{pageRanges(r.pages)}</div>
                        {r.continuationPages.length ? (
                          <div className="small muted">{t('payroll.continuation', { pages: pageRanges(r.continuationPages) })}</div>
                        ) : null}
                        {r.manualPages.length ? <div className="small muted">{t('payroll.manual', { pages: pageRanges(r.manualPages) })}</div> : null}
                        {r.pagesWithoutName.length ? (
                          <div className="small" style={{ color: 'var(--danger)' }}>
                            {t('payroll.nameMissing', { pages: pageRanges(r.pagesWithoutName) })}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {r.trust && r.trust.kind !== 'mismatch' ? (
                          <>
                            <span className="mono" title="SHA-256 X25519 ‖ Ed25519">
                              {r.trust.fingerprint}
                            </span>
                            {r.trust.kind === 'first_use' ? (
                              <div className="small muted" title={t('payroll.firstUseHint')}>
                                {t('payroll.firstUse')}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="small muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="stack" style={{ gap: 6, alignItems: 'flex-start' }}>
                          <span className={`badge ${BADGE[r.state]}`}>{t(`payroll.state.${r.state}` as MessageKey)}</span>
                          {r.state === 'key_changed' ? (
                            <button className="btn btn-sm" disabled={Boolean(pending)} onClick={() => setVerifying(r)}>
                              {t('payroll.verify')}
                            </button>
                          ) : null}
                          {r.state === 'delivered' ? (
                            <label className="toggle small">
                              <input
                                type="checkbox"
                                checked={resend.has(r.memberId)}
                                disabled={Boolean(pending)}
                                onChange={(e) =>
                                  setResend((s) => {
                                    const next = new Set(s);
                                    if (e.target.checked) next.add(r.memberId);
                                    else next.delete(r.memberId);
                                    return next;
                                  })
                                }
                              />
                              {t('payroll.sendAgain')}
                            </label>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {analysis.split.issues.length ? (
            <div className="stack">
              <h3>{t('payroll.issues')}</h3>
              {analysis.split.issues.map((issue) => (
                <div key={issue.page} className="row" style={{ flexWrap: 'wrap' }}>
                  <span className="small">{t(`payroll.issue.${issue.kind}` as MessageKey, { page: issue.page })}</span>
                  {issue.kind !== 'unassigned' ? <span className="mono small muted">{issue.codiciFiscali.join(', ')}</span> : null}
                  <span className="spacer" />
                  <label className="row small">
                    {t('payroll.assign')}
                    <select
                      value={manual[issue.page] ?? ''}
                      disabled={Boolean(pending)}
                      onChange={(e) =>
                        setManual((m) => {
                          const next = { ...m };
                          if (e.target.value) next[issue.page] = e.target.value;
                          else delete next[issue.page];
                          return next;
                        })
                      }
                    >
                      <option value="">{t('payroll.dontSend')}</option>
                      {assignable.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          ) : null}
          {skipped.length ? <div className="notice notice-warn">{t('payroll.skippedPages', { n: skipped.length })}</div> : null}
          {toReview.length && !pending ? (
            <div className="notice notice-warn stack" style={{ gap: 8 }} role="alert">
              <strong>{t('payroll.reviewTitle')}</strong>
              <span className="small">{t('payroll.reviewBody')}</span>
              {toReview.flatMap((r) => r.pagesRequiringReview.map((page) => (
                <label className="row small" key={`${r.memberId}-${page}`} style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={reviewedPages[page] === r.memberId}
                    onChange={(e) => setReviewedPages((current) => {
                      const next = { ...current };
                      if (e.target.checked) next[page] = r.memberId;
                      else delete next[page];
                      return next;
                    })}
                  />
                  <a href={`${sourcePdfUrl}#page=${page}`} target="_blank" rel="noopener noreferrer">
                    {t('payroll.reviewOpenPage', { page })}
                  </a>
                  <span>{t('payroll.reviewPageConfirm', { page, name: r.fullName })}</span>
                </label>
              )))}
            </div>
          ) : null}

          <ErrorNotice error={error} />
          {work ? (
            <div className="stack" style={{ gap: 6 }} role="status">
              <span className="small muted">{t(`payroll.${work.phase}`, { done: work.done, total: work.total })}</span>
              <div className="progress progress-inline">
                <div style={{ width: `${work.total ? Math.round((work.done / work.total) * 100) : 100}%` }} />
              </div>
            </div>
          ) : null}
          <div className="row">
            <span className="spacer" />
            <button
              className="btn btn-primary"
              disabled={Boolean(work) || (!pending && (sending.length === 0 || !reviewComplete))}
              onClick={publish}
            >
              {pending ? t('payroll.retry') : t('payroll.publish', { n: sending.length })}
            </button>
          </div>
        </section>
      ) : null}

      <History />

      {verifying && verifying.trust?.kind === 'changed' && verifying.key ? (
        <Modal title={t('payroll.verifyTitle', { name: verifying.fullName })} onClose={() => setVerifying(null)}>
          <p className="small">{t('payroll.verifyBody')}</p>
          <div className="stack" style={{ gap: 4 }}>
            <span className="small muted">{t('payroll.verifyPrevious')}</span>
            <span className="mono muted">{verifying.trust.previous}</span>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <span className="small muted">{t('payroll.verifyCurrent')}</span>
            <span className="mono" style={{ fontSize: 18, fontWeight: 600 }}>
              {verifying.trust.fingerprint}
            </span>
          </div>
          <div className="row">
            <span className="spacer" />
            <button className="btn" onClick={() => setVerifying(null)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const { memberId, key, trust: state } = verifying;
                if (key && state?.kind === 'changed') {
                  remember({ [memberId]: { deviceKeyId: key.id, fingerprint: state.fingerprint, pinnedAt: new Date().toISOString() } });
                }
                setVerifying(null);
              }}
            >
              {t('payroll.verifyConfirm')}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function History() {
  const { t, formatDateTime } = useI18n();
  const batches = usePayrollBatches();
  const names = useMemberNames();
  const [open, setOpen] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<BatchDocument | null>(null);
  return (
    <section className="card stack">
      <h2>{t('payroll.history')}</h2>
      <ErrorNotice error={batches.error} />
      {batches.isLoading ? (
        <p className="muted">{t('common.loading')}</p>
      ) : !batches.data?.length ? (
        <p className="empty">{t('payroll.historyEmpty')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('payroll.docTitle')}</th>
                <th>{t('payroll.kind')}</th>
                <th>{t('employees.status')}</th>
                <th>{t('payroll.recipients')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {batches.data.map((b) => {
                const live = b.documents.filter((d) => d.status !== 'deleted');
                const total = live.length;
                const opened = live.filter((d) => d.first_opened_at).length;
                const withdrawn = b.documents.length - live.length;
                return (
                  <Fragment key={b.id}>
                    <tr>
                      <td style={{ fontWeight: 600 }}>{b.title}</td>
                      <td className="small">{t(`kind.${b.kind}` as MessageKey)}</td>
                      <td className="small">
                        {b.status === 'published' && b.published_at ? (
                          formatDateTime(b.published_at)
                        ) : (
                          <span className="badge badge-muted">{t('payroll.draft')}</span>
                        )}
                      </td>
                      <td className="small">
                        {b.status === 'published' ? t('payroll.opened', { opened, total }) : '—'}
                        {withdrawn > 0 ? <div className="muted">{t('payroll.withdrawnCount', { n: withdrawn })}</div> : null}
                      </td>
                      <td>
                        {b.status === 'published' ? (
                          <button className="btn btn-sm" onClick={() => setOpen(open === b.id ? null : b.id)}>
                            {t(open === b.id ? 'payroll.hideDocuments' : 'payroll.showDocuments')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {open === b.id ? (
                      <tr>
                        <td colSpan={5}>
                          <ul className="stack" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
                            {b.documents.map((d) => (
                              <li key={d.id} className="row">
                                <span style={{ fontWeight: 600 }}>{names.get(d.member_id) ?? '—'}</span>
                                <span className="small muted">{d.title}</span>
                                <span className="spacer" />
                                {d.status === 'deleted' ? (
                                  <span className="badge badge-muted">{t('payroll.withdrawn')}</span>
                                ) : (
                                  <>
                                    <span className={`badge ${d.first_opened_at ? '' : 'badge-muted'}`}>
                                      {d.first_opened_at ? t('payroll.openedOn', { when: formatDateTime(d.first_opened_at) }) : t('payroll.notOpened')}
                                    </span>
                                    <button className="btn btn-sm btn-danger" onClick={() => setWithdrawing(d)}>
                                      {t('payroll.withdraw')}
                                    </button>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {withdrawing ? (
        <WithdrawDocument doc={withdrawing} recipient={names.get(withdrawing.member_id) ?? ''} onClose={() => setWithdrawing(null)} />
      ) : null}
    </section>
  );
}

interface WithdrawResult {
  storage_path: string;
  downloaded: boolean;
  first_opened_at: string | null;
}

/** D1: withdraw a document sent to the wrong person, with breach guidance if it was already downloaded. */
function WithdrawDocument({ doc, recipient, onClose }: { doc: BatchDocument; recipient: string; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<WithdrawResult | null>(null);
  const [fileRemoved, setFileRemoved] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('withdraw_document', { p_document_id: doc.id, p_reason: reason.trim() });
    if (error) {
      setBusy(false);
      return setError(error);
    }
    const res = data as WithdrawResult;
    // The key wrap is already gone, so nobody can decrypt the file any more;
    // removing the ciphertext is housekeeping.
    const removal = await supabase.storage.from('encrypted-documents').remove([res.storage_path]);
    setFileRemoved(!removal.error);
    setResult(res);
    setBusy(false);
    await queryClient.invalidateQueries({ queryKey: ['payroll'] });
  };

  return (
    <Modal title={t('payroll.withdrawTitle', { name: recipient })} onClose={onClose}>
      {result ? (
        <div className="stack">
          <div className="notice" role="status">
            {t('payroll.withdrawDone')}
          </div>
          {result.downloaded ? (
            <div className="notice notice-warn" role="alert">
              {t('payroll.withdrawBreach')}
            </div>
          ) : (
            <p className="small muted">{t('payroll.withdrawNotDownloaded')}</p>
          )}
          {!fileRemoved ? <p className="small muted">{t('payroll.withdrawFileLater')}</p> : null}
          <p className="small muted">{t('payroll.withdrawResend')}</p>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="small">{t('payroll.withdrawExplain', { title: doc.title })}</p>
          {doc.first_opened_at ? <div className="notice notice-warn">{t('payroll.withdrawAlreadyOpened')}</div> : null}
          <label className="field">
            {t('member.reason')}
            <input
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('payroll.withdrawPlaceholder')}
            />
          </label>
          <ErrorNotice error={error} />
          <div className="row">
            <span className="spacer" />
            <button className="btn btn-danger" disabled={busy}>
              {t('payroll.withdrawConfirm')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
