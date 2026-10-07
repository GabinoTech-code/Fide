// Employee import from CSV: read and checked in this browser, then sent in one
// all-or-nothing call (import_members). Rows already in the company are skipped,
// so fixing the file and importing it again is always safe.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useI18n, type MessageKey } from '../lib/i18n';
import {
  decodeCsv,
  failedRow,
  importPayload,
  MAX_IMPORT_ROWS,
  parseCsv,
  planImport,
  TEMPLATE_CSV,
  type ImportRow,
} from '../lib/memberImport';
import { useMembers, useSites } from '../lib/queries';
import { supabase } from '../lib/supabase';
import { ErrorNotice, Modal } from './ui';

const BADGE: Record<ImportRow['status'], string> = { ready: '', exists: 'badge-muted', error: 'badge-danger' };

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fide-dipendenti.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportEmployees({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { active } = useAuth();
  const queryClient = useQueryClient();
  const { data: members = [] } = useMembers();
  const { data: sites = [] } = useSites();
  const [table, setTable] = useState<string[][] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  // Re-planned when the member list changes: after an import those rows become "already there".
  const plan = useMemo(() => (table ? planImport(table, { members, sites }) : null), [table, members, sites]);
  const rows = plan?.rows ?? [];
  const ready = rows.filter((r) => r.status === 'ready');
  const count = (status: ImportRow['status']) => rows.filter((r) => r.status === status).length;

  async function readFile(file: File | undefined) {
    setError(null);
    setRowError(null);
    setDone(null);
    setTable(file ? parseCsv(decodeCsv(new Uint8Array(await file.arrayBuffer()))) : null);
  }

  async function submit() {
    if (!active || !ready.length) return;
    setBusy(true);
    setError(null);
    setRowError(null);
    const { data, error: rpcError } = await supabase.rpc('import_members', {
      p_company_id: active.company_id,
      p_rows: importPayload(ready),
    });
    setBusy(false);
    if (rpcError) {
      const failed = failedRow(rpcError, ready);
      if (failed) setRowError(t('import.rowFailed', { line: failed.line, reason: t(`import.reason.${failed.reason}` as MessageKey) }));
      else setError(rpcError);
      return;
    }
    setDone(data as number);
    await queryClient.invalidateQueries({ queryKey: ['members'] });
  }

  const describe = (r: ImportRow) => {
    if (r.status === 'error') return r.issues.map((i) => t(`import.issue.${i}` as MessageKey, { line: r.duplicateOf ?? '' })).join(' · ');
    if (r.status === 'exists') return t('import.existing', { name: r.existingName ?? '' });
    return r.noEmail ? t('import.noEmail') : '';
  };

  return (
    <Modal title={t('import.title')} onClose={onClose} wide>
      <p className="small muted">{t('import.body')}</p>
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: 1, minWidth: 220 }}>
          {t('import.file')}
          <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
        <button type="button" className="btn" onClick={downloadTemplate}>
          {t('import.template')}
        </button>
      </div>

      {plan?.missingName ? <div className="notice notice-danger">{t('import.missingName')}</div> : null}
      {plan && !plan.missingName && rows.length === 0 ? <p className="empty">{t('import.empty')}</p> : null}
      {rows.length ? (
        <>
          <div className="small" role="status">
            {t('import.summary', { ready: ready.length, exists: count('exists'), errors: count('error') })}
          </div>
          <div className="table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('import.line')}</th>
                  <th>{t('employees.fullName')}</th>
                  <th>{t('employees.cf')}</th>
                  <th>{t('employees.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="mono small">{r.line}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.fullName || '—'}</div>
                      <div className="small muted">{[r.email, r.siteName, r.employeeNumber].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="mono small">{r.codiceFiscale}</td>
                    <td>
                      <span className={`badge ${BADGE[r.status]}`}>{t(`import.status.${r.status}` as MessageKey)}</span>
                      <div className="small muted">{describe(r)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {count('error') ? <div className="notice notice-warn">{t('import.skipped')}</div> : null}
          {ready.length > MAX_IMPORT_ROWS ? <div className="notice notice-danger">{t('import.tooMany', { max: MAX_IMPORT_ROWS })}</div> : null}
        </>
      ) : null}

      {rowError ? (
        <div className="notice notice-danger" role="alert">
          {rowError}
        </div>
      ) : null}
      <ErrorNotice error={error} />
      {done !== null ? (
        <div className="notice" role="status">
          {t('import.done', { n: done })}
        </div>
      ) : null}

      <div className="row">
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
        <button className="btn btn-primary" disabled={busy || !ready.length || ready.length > MAX_IMPORT_ROWS} onClick={submit}>
          {t('import.submit', { n: ready.length })}
        </button>
      </div>
    </Modal>
  );
}
