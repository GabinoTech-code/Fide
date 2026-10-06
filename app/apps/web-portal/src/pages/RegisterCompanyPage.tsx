import { useState, type FormEvent } from 'react';
import { isValidPartitaIva } from '@fide/shared';
import { useAuth } from '../auth/AuthProvider';
import { ErrorNotice } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { supabase } from '../lib/supabase';

const OPTIONAL: Array<[string, MessageKey]> = [
  ['p_fiscal_code', 'register.fiscalCode'],
  ['p_pec', 'register.pec'],
  ['p_sdi_code', 'register.sdi'],
  ['p_inps_matricola', 'register.inps'],
  ['p_ccnl', 'register.ccnl'],
  ['p_address', 'register.address'],
];

export function RegisterCompanyPage({ onCancel }: { onCancel: () => void }) {
  const { t } = useI18n();
  const { refreshMemberships, setActiveCompany } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (key: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const vat = (form.p_vat_number ?? '').replace(/\s/g, '');
  const vatInvalid = vat.length > 0 && !isValidPartitaIva(vat);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const args = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
    const { data, error } = await supabase.rpc('register_company', { ...args, p_vat_number: vat });
    if (error) {
      setError(error);
      setBusy(false);
      return;
    }
    setActiveCompany(data as string);
    await refreshMemberships();
  };

  return (
    <div className="center">
      <form className="card stack auth-card" style={{ width: 'min(640px, 100%)' }} onSubmit={submit}>
        <h1>{t('register.title')}</h1>
        <p className="muted small">{t('register.note')}</p>
        <label className="field">
          {t('register.legalName')}
          <input required minLength={2} value={form.p_legal_name ?? ''} onChange={set('p_legal_name')} />
        </label>
        <div className="grid-2">
          <label className="field">
            {t('register.vat')}
            <input
              required
              inputMode="numeric"
              aria-invalid={vatInvalid}
              value={form.p_vat_number ?? ''}
              onChange={set('p_vat_number')}
            />
            {vatInvalid ? <small style={{ color: 'var(--danger)' }}>{t('register.vatInvalid')}</small> : null}
          </label>
          <label className="field">
            {t('register.ownerName')}
            <input required value={form.p_owner_full_name ?? ''} onChange={set('p_owner_full_name')} />
          </label>
        </div>
        <div className="grid-2">
          {OPTIONAL.map(([key, label]) => (
            <label className="field" key={key}>
              <span>
                {t(label)} <small>({t('common.optional')})</small>
              </span>
              <input value={form[key] ?? ''} onChange={set(key)} />
            </label>
          ))}
        </div>
        <ErrorNotice error={error} />
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={busy || vatInvalid}>
            {t('register.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
