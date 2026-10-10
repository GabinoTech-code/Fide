import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { employmentState, type EmploymentTerms } from '@fide/shared';
import { todayInRome } from '../lib/memberStatus';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import type { Member } from '../lib/types';
import { ErrorNotice } from './ui';

export function MemberEmployment({ member }: { member: Member }) {
  const { t } = useI18n();
  const today = todayInRome();
  const query = useQuery({
    queryKey: ['employment', member.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('employment_terms').select('id,effective_from,job_title,category,level,contract_type,ccnl_reference,weekly_hours,voided_at')
        .eq('company_id', member.company_id).eq('member_id', member.id).order('effective_from', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      return data as EmploymentTerms[];
    },
  });
  const [form, setForm] = useState({ effective_from: today, job_title: '', category: '', level: '', contract_type: '', ccnl_reference: '', weekly_hours: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [voidId, setVoidId] = useState<string | null>(null);
  const rows = query.data ?? [];
  const latest = rows.find((row) => !row.voided_at);
  const [expectedLatest, setExpectedLatest] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (query.isSuccess && expectedLatest === undefined) setExpectedLatest(latest?.id ?? null);
  }, [query.isSuccess, latest?.id, expectedLatest]);
  const stale = query.isSuccess && expectedLatest !== undefined && expectedLatest !== (latest?.id ?? null);
  async function reload() {
    const result = await query.refetch();
    if (result.isSuccess) {
      setExpectedLatest(result.data.find((row) => !row.voided_at)?.id ?? null);
      setForm({ effective_from: today, job_title: '', category: '', level: '', contract_type: '', ccnl_reference: '', weekly_hours: '' });
      setError(null); setSaved(false);
    }
  }
  const writable = ['active', 'invited', 'suspended'].includes(member.status);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !writable || !query.isSuccess || stale || expectedLatest === undefined) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const { error } = await supabase.rpc('add_employment_terms', { p_member_id: member.id,
        ...Object.fromEntries(Object.entries(form).map(([key, value]) => [`p_${key}`, key === 'weekly_hours' ? Number(value) : value])),
        p_expected_latest_id: expectedLatest });
      if (error) throw error;
      const updated = await query.refetch();
      if (updated.isSuccess) setExpectedLatest(updated.data.find((row) => !row.voided_at)?.id ?? null);
      setSaved(true);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  async function withdraw() {
    if (!voidId || busy) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const { error } = await supabase.rpc('void_employment_terms', { p_id: voidId });
      if (error) throw error;
      const updated = await query.refetch();
      if (updated.isSuccess) setExpectedLatest(updated.data.find((row) => !row.voided_at)?.id ?? null);
      setVoidId(null); setSaved(true);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <div className="stack">
    <p className="small muted">{t('employment.hint')}</p>
    <ErrorNotice error={error ?? query.error} />
    {query.isPending ? <p>{t('common.loading')}</p> : null}
    {stale ? <p role="alert">{t('employment.stale')}</p> : null}
    {query.isError || stale || error ? <button className="btn" disabled={busy} onClick={reload}>{t('employment.reload')}</button> : null}
    {saved ? <p role="status">{t('employment.saved')}</p> : null}
    {query.isSuccess && !rows.length ? <p>{t('employment.empty')}</p> : null}
    {rows.map((row) => <div key={row.id} className="subcard stack">
      <strong>{t(`employment.${employmentState(row, rows, today)}`)} · {row.effective_from}</strong>
      <span>{t('employment.job_title')}: {row.job_title}</span>
      <span>{t('employment.category')}: {row.category ?? '—'} · {t('employment.level')}: {row.level ?? '—'}</span>
      <span>{t('employment.contract_type')}: {row.contract_type} · {t('employment.weekly_hours')}: {Number(row.weekly_hours)}</span>
      <span>{t('employment.ccnl_reference')}: {row.ccnl_reference ?? '—'}</span>
      {!row.voided_at && writable ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setForm({ effective_from: row.effective_from < today ? today : row.effective_from, job_title: row.job_title, category: row.category ?? '', level: row.level ?? '', contract_type: row.contract_type, ccnl_reference: row.ccnl_reference ?? '', weekly_hours: String(row.weekly_hours) }); setSaved(false); }}>{t('employment.copy')}</button> : null}
      {!row.voided_at && row.effective_from > today && writable ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setVoidId(row.id)}>{t('employment.withdraw')}</button> : null}
    </div>)}
    {voidId ? <div className="notice notice-warn stack" role="alert"><span>{t('employment.confirmWithdraw')}</span><div className="row">
      <button className="btn" disabled={busy} onClick={() => setVoidId(null)}>{t('common.cancel')}</button>
      <button className="btn" disabled={busy} onClick={withdraw}>{t('employment.withdraw')}</button>
    </div></div> : null}
    {writable ? <form className="stack" onSubmit={save}>
      <h3>{t('employment.new')}</h3>
      {(['effective_from', 'job_title', 'category', 'level', 'contract_type', 'ccnl_reference', 'weekly_hours'] as const).map((key) => <label className="field" key={key}>
        {t(`employment.${key}`)}
        <input type={key === 'effective_from' ? 'date' : key === 'weekly_hours' ? 'number' : 'text'}
          required={['effective_from', 'job_title', 'contract_type', 'weekly_hours'].includes(key)}
          min={key === 'weekly_hours' ? 0.01 : key === 'effective_from' ? latest ? latest.effective_from > today ? latest.effective_from : today : '1900-01-01' : undefined}
          max={key === 'weekly_hours' ? 168 : key === 'effective_from' ? '2100-12-31' : undefined}
          step={key === 'weekly_hours' ? '0.01' : undefined} maxLength={key === 'category' || key === 'level' || key === 'contract_type' ? 100 : 200}
          value={form[key]} disabled={busy} onChange={(event) => { setSaved(false); setForm((previous) => ({ ...previous, [key]: event.target.value })); }} />
      </label>)}
      <button className="btn btn-primary" disabled={busy || !query.isSuccess || stale || expectedLatest === undefined}>{t('employment.save')}</button>
    </form> : null}
  </div>;
}
