import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { isValidCodiceFiscale, normalizeCodiceFiscale } from '@fide/shared';
import { useAuth } from '../auth/AuthProvider';
import { ImportEmployees } from '../components/ImportEmployees';
import { ErrorNotice, Modal, PageHead } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { useMembers, useSites } from '../lib/queries';
import { callFunction, supabase } from '../lib/supabase';
import type { Member } from '../lib/types';

/** PostgREST returns embedded one-to-one rows as an object or a one-element array. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function activeKey(m: Member) {
  return (m.device_keys ?? []).find((k) => k.status === 'active') ?? null;
}

export function EmployeesPage() {
  const { t } = useI18n();
  const { data: members = [], isLoading, error } = useMembers();
  const { data: sites = [] } = useSites();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [inviting, setInviting] = useState<Member | null>(null);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHead title={t('employees.title')}>
        <button className="btn" onClick={() => setImporting(true)}>
          {t('import.button')}
        </button>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          {t('employees.add')}
        </button>
      </PageHead>
      <ErrorNotice error={error} />
      <section className="card">
        {isLoading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : members.length === 0 ? (
          <p className="empty">{t('employees.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('employees.fullName')}</th>
                  <th>{t('employees.role')}</th>
                  <th>{t('employees.site')}</th>
                  <th>{t('employees.status')}</th>
                  <th>{t('employees.device')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const identity = one(m.member_identities);
                  const key = activeKey(m);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.full_name}</div>
                        <div className="small muted">{identity?.email}</div>
                        <div className="mono muted" style={{ fontSize: 12 }}>
                          {identity?.codice_fiscale}
                        </div>
                      </td>
                      <td className="small">{t(`role.${m.role}` as MessageKey)}</td>
                      <td className="small">{m.site_id ? siteName.get(m.site_id) : '—'}</td>
                      <td>
                        <span className={`badge ${m.status === 'active' ? '' : 'badge-muted'}`}>{t(`status.${m.status}` as MessageKey)}</span>
                      </td>
                      <td>
                        {key ? (
                          <span className="mono" title="SHA-256 X25519 ‖ Ed25519">
                            {key.fingerprint}
                          </span>
                        ) : (
                          <span className="small muted">{t('employees.noDevice')}</span>
                        )}
                      </td>
                      <td>
                        {m.status === 'invited' ? (
                          <button className="btn btn-sm" onClick={() => setInviting(m)}>
                            {t('employees.invite')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {adding ? <AddEmployee onClose={() => setAdding(false)} /> : null}
      {importing ? <ImportEmployees onClose={() => setImporting(false)} /> : null}
      {inviting ? <InviteEmployee member={inviting} onClose={() => setInviting(null)} /> : null}
    </>
  );
}

function AddEmployee({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { active } = useAuth();
  const { data: sites = [] } = useSites();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', cf: '', number: '', site: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const cf = normalizeCodiceFiscale(form.cf);
  const cfInvalid = cf.length > 0 && !isValidCodiceFiscale(cf);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('add_member', {
      p_company_id: active!.company_id,
      p_full_name: form.name.trim(),
      p_email: form.email.trim() || null,
      p_codice_fiscale: cf || null,
      p_site_id: form.site || null,
      p_employee_number: form.number.trim() || null,
    });
    setBusy(false);
    if (error) return setError(error);
    await queryClient.invalidateQueries({ queryKey: ['members'] });
    onClose();
  };

  return (
    <Modal title={t('employees.add')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          {t('employees.fullName')}
          <input required value={form.name} onChange={set('name')} />
        </label>
        <label className="field">
          {t('employees.email')}
          <input type="email" required value={form.email} onChange={set('email')} />
        </label>
        <div className="grid-2">
          <label className="field">
            {t('employees.cf')}
            <input aria-invalid={cfInvalid} value={form.cf} onChange={set('cf')} style={{ textTransform: 'uppercase' }} />
            {cfInvalid ? <small style={{ color: 'var(--danger)' }}>{t('employees.cfInvalid')}</small> : null}
          </label>
          <label className="field">
            <span>
              {t('employees.number')} <small>({t('common.optional')})</small>
            </span>
            <input value={form.number} onChange={set('number')} />
          </label>
        </div>
        <label className="field">
          {t('employees.site')}
          <select value={form.site} onChange={set('site')}>
            <option value="">—</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <ErrorNotice error={error} />
        <div className="row">
          <span className="spacer" />
          <button className="btn btn-primary" disabled={busy || cfInvalid}>
            {t('common.add')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InviteEmployee({ member, onClose }: { member: Member; onClose: () => void }) {
  const { t } = useI18n();
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  // 'none': link only; 'sent': Brevo accepted it; 'failed': asked for e-mail but it did not go out.
  const [mail, setMail] = useState<'none' | 'sent' | 'failed'>('none');
  const [mailError, setMailError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const email = one(member.member_identities)?.email ?? '';

  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#0F1A17', light: '#FFFFFF' } }).then(setQr);
  }, [link]);

  // Every call creates a new invitation and revokes the previous link.
  const create = async (sendEmail: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await callFunction<{ link: string; emailed: boolean; email_error?: string }>('invite-employee', {
        member_id: member.id,
        send_email: sendEmail,
      });
      setLink(res.link);
      setCopied(false);
      setMail(!sendEmail ? 'none' : res.emailed ? 'sent' : 'failed');
      setMailError(res.email_error ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!email) {
    return (
      <Modal title={t('employees.inviteTitle', { name: member.full_name })} onClose={onClose}>
        <div className="notice notice-warn">{t('employees.inviteNoEmail')}</div>
      </Modal>
    );
  }

  return (
    <Modal title={t('employees.inviteTitle', { name: member.full_name })} onClose={onClose}>
      <p className="muted small">{t('employees.inviteBody', { email })}</p>
      {link ? (
        <div className="stack">
          {qr ? <img src={qr} alt="" width={200} height={200} style={{ alignSelf: 'center' }} /> : null}
          <div className="row">
            <input readOnly value={link} className="mono" style={{ flex: 1 }} onFocus={(e) => e.target.select()} />
            <button
              className="btn"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
          {mail === 'sent' ? (
            <div className="notice" role="status">
              {t('employees.inviteEmailed', { email })}
            </div>
          ) : null}
          {mail === 'failed' ? (
            <div className="notice notice-warn" role="alert">
              {t('employees.inviteEmailFailed')}
              {mailError ? <span className="mono"> ({mailError})</span> : null}
            </div>
          ) : null}
          {mail !== 'sent' ? (
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => create(true)}>
                {mail === 'failed' ? t('common.retry') : t('employees.inviteEmail')}
              </button>
              <span className="muted small">{t('employees.inviteNewLinkHint')}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="row">
          <button className="btn btn-primary" disabled={busy} onClick={() => create(true)}>
            {t('employees.inviteSend')}
          </button>
          <button className="btn" disabled={busy} onClick={() => create(false)}>
            {t('employees.inviteLinkOnly')}
          </button>
        </div>
      )}
      <ErrorNotice error={error} />
    </Modal>
  );
}
