// Block 1 · E1–E3, F1, V2: everything HR does to one employee, in one panel.
//   Dati     — update_member (the e-mail only while invited: it is the login)
//   Stato    — suspend / reactivate / terminate, revoke the phone
//   Registra — punches and absences recorded by HR on the employee's behalf
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isValidCodiceFiscale, normalizeCodiceFiscale, romeLocalToIso, romeNowLocal } from '@fide/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n, type MessageKey } from '../lib/i18n';
import { activeKey, APP_LANGUAGES, one } from '../lib/members';
import { accessUntil, todayInRome } from '../lib/memberStatus';
import { useLeaveTypes, useMembers, useSites } from '../lib/queries';
import { APPROVER_ROLES, releasedTeam } from '../lib/roleChange';
import { supabase } from '../lib/supabase';
import type { Member, MemberStatus } from '../lib/types';
import { ErrorNotice, Modal } from './ui';

type Tab = 'data' | 'status' | 'entries';

export function MemberPanel({ member, onClose }: { member: Member; onClose: () => void }) {
  const { t } = useI18n();
  const { active } = useAuth();
  const isSelf = active?.id === member.id;
  const canRecord = !isSelf && (member.status === 'active' || member.status === 'terminated');
  const [tab, setTab] = useState<Tab>('data');

  return (
    <Modal title={member.full_name} onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {(['data', 'status', 'entries'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`tab${tab === k ? ' tab-active' : ''}`}
            disabled={k === 'entries' && !canRecord}
            onClick={() => setTab(k)}
          >
            {t(`member.tab.${k}` as MessageKey)}
          </button>
        ))}
      </div>
      {tab === 'data' ? <DataTab member={member} /> : null}
      {tab === 'status' ? <StatusTab member={member} isSelf={isSelf} /> : null}
      {tab === 'entries' && canRecord ? <EntriesTab member={member} /> : null}
    </Modal>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ['members', 'punches', 'leave', 'corrections', 'requestHistory', 'payroll'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
}

/**
 * The member's role, saved on its own (set_member_role). HR names team
 * managers; only an owner hands out HR or owner powers (the RPC checks too).
 */
function RoleField({ member }: { member: Member }) {
  const { t } = useI18n();
  const { active } = useAuth();
  const refresh = useRefresh();
  const [role, setRole] = useState(member.role);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { data: members = [] } = useMembers();
  const owner = active?.role === 'company_owner';
  const options: Member['role'][] = owner ? ['employee', 'manager', 'hr_admin', 'company_owner'] : ['employee', 'manager'];
  const locked = !owner && (member.role === 'hr_admin' || member.role === 'company_owner');
  const released = releasedTeam(member, role, members);
  useEffect(() => {
    setRole(member.role);
    setConfirming(false);
  }, [member.id, member.role]);

  const save = async () => {
    if (!confirming || locked || busy || role === member.role) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('set_member_role', { p_member_id: member.id, p_role: role });
    setBusy(false);
    if (error) return setError(error);
    setConfirming(false);
    await refresh();
  };

  return (
    <div className="field">
      {t('member.role')}
      <div className="row" style={{ gap: 8 }}>
        <select value={role} onChange={(e) => { setRole(e.target.value as Member['role']); setConfirming(false); setError(null); }} disabled={locked || busy} aria-label={t('member.role')} style={{ flex: 1 }}>
          {(locked ? [member.role] : options).map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}` as MessageKey)}
            </option>
          ))}
        </select>
        {role !== member.role ? (
          <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)} disabled={busy || locked || confirming}>
            {t('member.roleSave')}
          </button>
        ) : null}
      </div>
      <small className="muted">{t(role === 'manager' ? 'member.roleManagerHint' : 'member.roleHint')}</small>
      <p className="small">{t(`roles.scope.${role}` as MessageKey)}</p>
      {confirming ? (
        <div className="notice notice-warn stack" role="alert">
          <strong>{t('roles.confirmTitle', { name: member.full_name, from: t(`role.${member.role}` as MessageKey), to: t(`role.${role}` as MessageKey) })}</strong>
          <span>{t('roles.confirmBody')}</span>
          {released.length ? <span>{t('roles.releasesTeam', { n: released.length, names: released.map((m) => m.full_name).join(', ') })}</span> : null}
          {active?.id === member.id ? <span>{t('roles.selfChange')}</span> : null}
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-primary" disabled={busy || locked} onClick={save}>{t('roles.confirm')}</button>
          </div>
        </div>
      ) : null}
      <ErrorNotice error={error} />
    </div>
  );
}

function DataTab({ member }: { member: Member }) {
  const { t, locale } = useI18n();
  const { data: sites = [] } = useSites();
  const { data: members = [] } = useMembers();
  const refresh = useRefresh();
  const identity = one(member.member_identities);
  const [form, setForm] = useState({
    name: member.full_name,
    email: identity?.email ?? '',
    cf: identity?.codice_fiscale ?? '',
    number: member.employee_number ?? '',
    site: member.site_id ?? '',
    manager: member.manager_member_id ?? '',
    language: member.preferred_language,
  });
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const cf = normalizeCodiceFiscale(form.cf);
  const cfInvalid = cf.length > 0 && !isValidCodiceFiscale(cf);
  const emailEditable = member.status === 'invited';
  const languageName = useMemo(() => new Intl.DisplayNames([locale], { type: 'language' }), [locale]);
  // Only people who can approve may lead a team (members_manager_role trigger).
  const managers = members.filter(
    (m) => m.id !== member.id && m.status === 'active' && APPROVER_ROLES.includes(m.role),
  );
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('update_member', {
      p_member_id: member.id,
      p_full_name: form.name.trim(),
      p_email: form.email.trim() || null,
      p_codice_fiscale: cf || null,
      p_employee_number: form.number.trim() || null,
      p_site_id: form.site || null,
      p_manager_member_id: form.manager || null,
      p_preferred_language: form.language,
    });
    setBusy(false);
    if (error) return setError(error);
    setSaved(true);
    await refresh();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        {t('employees.fullName')}
        <input required value={form.name} onChange={set('name')} />
      </label>
      <label className="field">
        {t('employees.email')}
        <input type="email" required value={form.email} onChange={set('email')} disabled={!emailEditable} />
        <small className="muted">{t(emailEditable ? 'member.emailInvitedHint' : 'member.emailLockedHint')}</small>
      </label>
      <div className="grid-2">
        <label className="field">
          {t('employees.cf')}
          <input aria-invalid={cfInvalid} value={form.cf} onChange={set('cf')} style={{ textTransform: 'uppercase' }} />
          {cfInvalid ? <small style={{ color: 'var(--danger)' }}>{t('employees.cfInvalid')}</small> : null}
          {identity?.codice_fiscale && cf !== identity.codice_fiscale ? (
            <small className="muted">{t('member.cfChangeHint')}</small>
          ) : null}
        </label>
        <label className="field">
          <span>
            {t('employees.number')} <small>({t('common.optional')})</small>
          </span>
          <input value={form.number} onChange={set('number')} />
        </label>
      </div>
      <div className="grid-2">
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
        <label className="field">
          {t('member.manager')}
          <select value={form.manager} onChange={set('manager')}>
            <option value="">—</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <RoleField member={member} />
      <label className="field">
        {t('member.language')}
        <select value={form.language} onChange={set('language')}>
          {APP_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageName.of(code)}
            </option>
          ))}
        </select>
      </label>
      <ErrorNotice error={error} />
      {saved ? (
        <div className="notice" role="status">
          {t('member.saved')}
        </div>
      ) : null}
      <div className="row">
        <span className="spacer" />
        <button className="btn btn-primary" disabled={busy || cfInvalid}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

interface StatusResult {
  status: MemberStatus;
  terminated_on: string | null;
  cancelled_requests: number;
  reports: number;
}

function StatusTab({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const { t, formatDateTime } = useI18n();
  const refresh = useRefresh();
  const [action, setAction] = useState<'suspend' | 'terminate' | 'reactivate' | null>(null);
  const [day, setDay] = useState(todayInRome());
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const date = (iso: string) => formatDateTime(`${iso}T12:00:00Z`, { dateStyle: 'long' });

  const apply = async () => {
    setBusy(true);
    setError(null);
    const status: MemberStatus = action === 'suspend' ? 'suspended' : action === 'terminate' ? 'terminated' : 'active';
    const { data, error } = await supabase.rpc('set_member_status', {
      p_member_id: member.id,
      p_status: status,
      p_terminated_on: action === 'terminate' ? day : null,
    });
    setBusy(false);
    if (error) return setError(error);
    setResult(data as StatusResult);
    setAction(null);
    await refresh();
  };

  return (
    <div className="stack">
      <section className="stack" style={{ gap: 8 }}>
        <h3>{t('member.statusTitle')}</h3>
        <div className="row">
          <span className={`badge ${member.status === 'active' ? '' : member.status === 'terminated' ? 'badge-warn' : 'badge-muted'}`}>
            {t(`status.${member.status}` as MessageKey)}
          </span>
          {member.status === 'terminated' && member.terminated_on ? (
            <span className="small muted">
              {t('member.terminatedInfo', { day: date(member.terminated_on), until: date(accessUntil(member.terminated_on)) })}
            </span>
          ) : null}
          {member.status === 'suspended' && member.status_changed_at ? (
            <span className="small muted">{t('member.suspendedSince', { when: formatDateTime(member.status_changed_at) })}</span>
          ) : null}
        </div>

        {isSelf ? <p className="small muted">{t('member.selfNote')}</p> : null}
        {member.status === 'invited' ? <p className="small muted">{t('member.invitedNote')}</p> : null}

        {!isSelf && member.status !== 'invited' && member.status !== 'erased' && !action ? (
          <div className="row">
            {member.status === 'active' ? (
              <button className="btn" onClick={() => setAction('suspend')}>
                {t('member.suspend')}
              </button>
            ) : (
              <button className="btn" onClick={() => setAction('reactivate')}>
                {t(member.status === 'terminated' ? 'member.undoTermination' : 'member.reactivate')}
              </button>
            )}
            {member.status !== 'terminated' ? (
              <button className="btn btn-danger" onClick={() => setAction('terminate')}>
                {t('member.terminate')}
              </button>
            ) : null}
          </div>
        ) : null}

        {action ? (
          <div className="subcard stack">
            <p className="small">{t(`member.${action}Explain` as MessageKey)}</p>
            {action === 'terminate' ? (
              <label className="field">
                {t('member.lastDay')}
                <input type="date" required max={todayInRome()} value={day} onChange={(e) => setDay(e.target.value)} />
                <small className="muted">{t('member.lastDayHint', { until: day ? date(accessUntil(day)) : '—' })}</small>
              </label>
            ) : null}
            <div className="row">
              <button className="btn" onClick={() => setAction(null)}>
                {t('common.cancel')}
              </button>
              <button
                className={`btn ${action === 'terminate' ? 'btn-danger' : 'btn-primary'}`}
                disabled={busy || (action === 'terminate' && !day)}
                onClick={apply}
              >
                {t(`member.${action}Confirm` as MessageKey)}
              </button>
            </div>
          </div>
        ) : null}

        <ErrorNotice error={error} />
        {result ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="notice" role="status">
              {t('member.statusDone', { status: t(`status.${result.status}` as MessageKey) })}
              {result.cancelled_requests > 0 ? ` ${t('member.cancelledRequests', { n: result.cancelled_requests })}` : ''}
            </div>
            {result.reports > 0 && result.status !== 'active' ? (
              <div className="notice notice-warn">{t('member.reportsWarning', { n: result.reports })}</div>
            ) : null}
          </div>
        ) : null}
      </section>

      <PhoneSection member={member} />
    </div>
  );
}

const REVOKE_REASONS = ['lost', 'stolen', 'replaced', 'other'] as const;

function PhoneSection({ member }: { member: Member }) {
  const { t, formatDateTime } = useI18n();
  const refresh = useRefresh();
  const key = activeKey(member);
  const [reason, setReason] = useState<(typeof REVOKE_REASONS)[number] | ''>('');
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    if (!key || !reason) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('revoke_device_key', { p_device_key_id: key.id, p_reason: `hr:${reason}` });
    setBusy(false);
    if (error) return setError(error);
    setDone(true);
    setOpen(false);
    await refresh();
  };

  return (
    <section className="stack" style={{ gap: 8 }}>
      <h3>{t('member.phoneTitle')}</h3>
      {key ? (
        <div className="row">
          <span className="mono" title="SHA-256 X25519 ‖ Ed25519">
            {key.fingerprint}
          </span>
          <span className="small muted">{t('member.phoneSince', { when: formatDateTime(key.created_at) })}</span>
          <span className="spacer" />
          {!open ? (
            <button className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>
              {t('member.revokePhone')}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="small muted">{done ? t('member.phoneRevoked') : t('employees.noDevice')}</p>
      )}
      {open && key ? (
        <div className="subcard stack">
          <p className="small">{t('member.revokeExplain')}</p>
          <label className="field">
            {t('member.revokeReason')}
            <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} required>
              <option value="">—</option>
              {REVOKE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`member.revokeReason.${r}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="btn" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger" disabled={busy || !reason} onClick={revoke}>
              {t('member.revokeConfirm')}
            </button>
          </div>
        </div>
      ) : null}
      <ErrorNotice error={error} />
    </section>
  );
}

/** Now in Italian time, for datetime-local inputs: company time, whatever the browser's zone. */
const localNow = () => romeNowLocal();

function EntriesTab({ member }: { member: Member }) {
  const { t } = useI18n();
  return (
    <div className="stack">
      <p className="small muted">{t('member.entriesExplain')}</p>
      <PunchEntry member={member} />
      <LeaveEntry member={member} />
    </div>
  );
}

function PunchEntry({ member }: { member: Member }) {
  const { t } = useI18n();
  const { data: sites = [] } = useSites();
  const refresh = useRefresh();
  const [form, setForm] = useState({ type: 'in', when: localNow(), site: member.site_id ?? '', reason: '' });
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setDone(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('hr_record_punch', {
      p_member_id: member.id,
      p_punch_type: form.type,
      p_ts: romeLocalToIso(form.when),
      p_site_id: form.site || null,
      p_reason: form.reason.trim(),
    });
    setBusy(false);
    if (error) return setError(error);
    setDone(true);
    setForm((f) => ({ ...f, reason: '' }));
    await refresh();
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h3>{t('member.recordPunch')}</h3>
      <div className="grid-2">
        <label className="field">
          {t('member.punchType')}
          <select value={form.type} onChange={set('type')}>
            <option value="in">{t('presence.in')}</option>
            <option value="out">{t('presence.out')}</option>
          </select>
        </label>
        <label className="field">
          {t('member.when')}
          <input type="datetime-local" required max={localNow()} value={form.when} onChange={set('when')} />
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
      <label className="field">
        {t('member.reason')}
        <input required minLength={3} maxLength={500} value={form.reason} onChange={set('reason')} placeholder={t('member.punchReasonPlaceholder')} />
      </label>
      <ErrorNotice error={error} />
      {done ? (
        <div className="notice" role="status">
          {t('member.punchRecorded')}
        </div>
      ) : null}
      <div className="row">
        <span className="spacer" />
        <button className="btn btn-primary" disabled={busy}>
          {t('member.recordPunch')}
        </button>
      </div>
    </form>
  );
}

function LeaveEntry({ member }: { member: Member }) {
  const { t } = useI18n();
  const { data: types = [] } = useLeaveTypes();
  const refresh = useRefresh();
  const today = todayInRome();
  const [form, setForm] = useState({ type: '', start: today, end: today, quantity: '1', protocol: '', note: '' });
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const type = types.find((x) => x.id === form.type) ?? null;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setDone(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('hr_record_leave', {
      p_member_id: member.id,
      p_leave_type_id: form.type,
      p_start_date: form.start,
      p_end_date: form.end,
      p_quantity: Number(form.quantity),
      p_note: form.note.trim(),
      p_protocol_number: form.protocol.trim() || null,
    });
    setBusy(false);
    if (error) return setError(error);
    setDone(true);
    setForm((f) => ({ ...f, note: '', protocol: '' }));
    await refresh();
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h3>{t('member.recordLeave')}</h3>
      <label className="field">
        {t('member.leaveType')}
        <select required value={form.type} onChange={set('type')}>
          <option value="">—</option>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid-2">
        <label className="field">
          {t('member.from')}
          <input type="date" required value={form.start} onChange={set('start')} />
        </label>
        <label className="field">
          {t('member.to')}
          <input type="date" required min={form.start} value={form.end} onChange={set('end')} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          {t(type?.unit === 'hours' ? 'member.quantityHours' : 'member.quantityDays')}
          <input type="number" required min="0.5" step="0.5" value={form.quantity} onChange={set('quantity')} />
        </label>
        {type?.requires_protocol ? (
          <label className="field">
            {t('member.protocol')}
            <input required maxLength={40} value={form.protocol} onChange={set('protocol')} className="mono" />
          </label>
        ) : null}
      </div>
      <label className="field">
        {t('member.reason')}
        <input required minLength={3} maxLength={500} value={form.note} onChange={set('note')} placeholder={t('member.leaveReasonPlaceholder')} />
      </label>
      <ErrorNotice error={error} />
      {done ? (
        <div className="notice" role="status">
          {t('member.leaveRecorded')}
        </div>
      ) : null}
      <div className="row">
        <span className="spacer" />
        <button className="btn btn-primary" disabled={busy}>
          {t('member.recordLeave')}
        </button>
      </div>
    </form>
  );
}
