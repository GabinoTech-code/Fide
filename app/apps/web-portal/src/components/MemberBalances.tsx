import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { todayInRome } from '../lib/memberStatus';
import { useI18n } from '../lib/i18n';
import { useLeaveTypes } from '../lib/queries';
import { supabase } from '../lib/supabase';
import type { Member } from '../lib/types';
import { ErrorNotice } from './ui';

interface Balance {
  id: string;
  leave_type_id: string;
  entitled: number;
  carried_over: number;
  used_external: number;
  note: string | null;
  updated_at: string;
}
interface Summary {
  leave_type_id: string;
  used: number;
  used_external: number;
  pending: number;
  remaining: number;
}

export function MemberBalances({ member }: { member: Member }) {
  const { t, locale, formatDateTime } = useI18n();
  const client = useQueryClient();
  const types = useLeaveTypes();
  const tracked = (types.data ?? []).filter((type) => type.tracks_balance);
  const [year, setYear] = useState(Number(todayInRome().slice(0, 4)));
  const [typeId, setTypeId] = useState('');
  const [form, setForm] = useState({ entitled: '', carried: '', external: '0', note: '' });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const query = useQuery({
    queryKey: ['member-balances', member.company_id, member.id, year],
    enabled: Number.isInteger(year) && year >= 2000 && year <= 2100,
    queryFn: async () => {
      const [balances, summary] = await Promise.all([
        supabase.from('leave_balances').select('id, leave_type_id, entitled, carried_over, used_external, note, updated_at')
          .eq('company_id', member.company_id).eq('member_id', member.id).eq('year', year),
        supabase.from('leave_balance_summary').select('leave_type_id, used, used_external, pending, remaining')
          .eq('company_id', member.company_id).eq('member_id', member.id).eq('year', year),
      ]);
      if (balances.error) throw balances.error;
      if (summary.error) throw summary.error;
      return { balances: balances.data as Balance[], summary: summary.data as Summary[] };
    },
  });
  const type = tracked.find((item) => item.id === typeId) ?? tracked[0];
  const current = query.data?.balances.find((item) => item.leave_type_id === type?.id);
  const summary = query.data?.summary.find((item) => item.leave_type_id === type?.id);
  useEffect(() => {
    setForm({ entitled: current ? String(current.entitled) : '', carried: current ? String(current.carried_over) : '0', external: current ? String(current.used_external) : '0', note: current?.note ?? '' });
    setError(null);
  }, [current, type?.id, year]);
  const number = (value: number) => Number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  const change = (key: keyof typeof form, value: string) => {
    setSaved(false);
    setForm((previous) => ({ ...previous, [key]: value }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!type || busy || query.isPending || query.isError) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const values = { entitled: Number(form.entitled), carried_over: Number(form.carried), used_external: Number(form.external), note: form.note.trim() || null };
      const result = current
        ? await supabase.from('leave_balances').update(values).eq('id', current.id).eq('company_id', member.company_id).eq('member_id', member.id).eq('updated_at', current.updated_at).select('id').single()
        : await supabase.from('leave_balances').insert({ ...values, company_id: member.company_id, member_id: member.id, leave_type_id: type.id, year }).select('id').single();
      if (result.error) throw result.error;
      await query.refetch();
      await client.invalidateQueries({ queryKey: ['audit'] });
      setSaved(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };
  const loading = types.isPending || query.isPending;
  return (
    <form className="stack" onSubmit={submit}>
      <p className="small muted">{t('balances.explain')}</p>
      <div className="row">
        <label className="field">{t('balances.year')}<input type="number" min="2000" max="2100" required value={year} disabled={busy} onChange={(e) => { setSaved(false); setYear(Number(e.target.value)); }} /></label>
        <label className="field">{t('balances.type')}<select value={type?.id ?? ''} disabled={busy || loading} onChange={(e) => { setSaved(false); setTypeId(e.target.value); }}>{tracked.map((item) => <option key={item.id} value={item.id}>{item.name} ({t(item.unit === 'days' ? 'balances.days' : 'balances.hours')})</option>)}</select></label>
      </div>
      <ErrorNotice error={error ?? query.error ?? types.error} />
      {error || query.isError || types.isError ? <button type="button" className="btn" disabled={busy} onClick={() => { setSaved(false); setError(null); void query.refetch(); void types.refetch(); }}>{t('balances.reload')}</button> : null}
      {loading ? <p>{t('common.loading')}</p> : type ? (
        <>
          {!current ? <p className="notice notice-warn">{t('balances.missing')}</p> : null}
          <label className="field">{t('balances.credited')}<input required type="number" min="0" max="99999.99" step="0.01" value={form.entitled} disabled={busy} onChange={(e) => change('entitled', e.target.value)} /></label>
          <label className="field">{t('balances.carried')}<input required type="number" min="-99999.99" max="99999.99" step="0.01" value={form.carried} disabled={busy} onChange={(e) => change('carried', e.target.value)} /></label>
          <label className="field">{t('balances.usedExternal')}<input required type="number" min="0" max="99999.99" step="0.01" value={form.external} disabled={busy} onChange={(e) => change('external', e.target.value)} /></label>
          <label className="field">{t('balances.source')}<input maxLength={200} value={form.note} disabled={busy} onChange={(e) => change('note', e.target.value)} /></label>
          {summary ? <p>{t('balances.summary', { used: number(Number(summary.used) + Number(summary.used_external)), pending: number(summary.pending), remaining: number(summary.remaining), unit: t(type.unit === 'days' ? 'balances.days' : 'balances.hours') })}</p> : null}
          {current ? <p className="small muted">{t('balances.updated', { at: formatDateTime(current.updated_at) })}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy || query.isError || types.isError}>{t('common.save')}</button>
          {saved ? <p role="status">{t('balances.saved')}</p> : null}
        </>
      ) : <p>{t('balances.noTypes')}</p>}
    </form>
  );
}
