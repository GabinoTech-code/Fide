import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Brand';
import { ErrorNotice, Modal, PageHead } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { useKiosks, useSites } from '../lib/queries';
import { supabase } from '../lib/supabase';
import type { Site } from '../lib/types';

export function SitesPage() {
  const { t } = useI18n();
  const { data: sites = [], isLoading, error } = useSites();
  const { data: kiosks = [] } = useKiosks();
  const [editing, setEditing] = useState<Partial<Site> | null>(null);
  const [kioskFor, setKioskFor] = useState<Site | null>(null);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<unknown>(null);

  const revoke = async (id: string) => {
    const { error } = await supabase.rpc('revoke_kiosk', { p_kiosk_id: id });
    setActionError(error);
    await queryClient.invalidateQueries({ queryKey: ['kiosks'] });
  };

  return (
    <>
      <PageHead title={t('sites.title')}>
        <button className="btn btn-primary" onClick={() => setEditing({ radius_m: 150, geo_enabled: false })}>
          {t('sites.add')}
        </button>
      </PageHead>
      <ErrorNotice error={error ?? actionError} />
      {isLoading ? <p className="muted">{t('common.loading')}</p> : null}
      <div className="grid-2">
        {sites.map((site) => (
          <section key={site.id} className="card stack">
            <div className="row">
              <div className="stack" style={{ gap: 2 }}>
                <h2>{site.name}</h2>
                <span className="small muted">{site.address}</span>
              </div>
              <span className="spacer" />
              <span className={`badge ${site.geo_enabled ? '' : 'badge-muted'}`}>
                <Icon name={site.geo_enabled ? 'geo' : 'qr'} size={16} />
                {t(site.geo_enabled ? 'sites.geoOn' : 'sites.qrOnly')}
              </span>
            </div>
            {site.geo_enabled ? (
              <span className="mono muted">
                {site.latitude?.toFixed(5)}, {site.longitude?.toFixed(5)} · {site.radius_m} m
              </span>
            ) : null}
            <h3>{t('sites.kiosks')}</h3>
            {kiosks
              .filter((k) => k.site_id === site.id)
              .map((k) => (
                <div key={k.id} className="row small">
                  <Icon name="qr" size={16} />
                  <span style={{ fontWeight: 600 }}>{k.name}</span>
                  <span className={`badge ${k.status === 'active' ? '' : 'badge-muted'}`}>{t(`kioskStatus.${k.status}` as MessageKey)}</span>
                  <span className="spacer" />
                  {k.status !== 'revoked' ? (
                    <button className="btn btn-sm btn-danger" onClick={() => revoke(k.id)}>
                      {t('sites.revokeKiosk')}
                    </button>
                  ) : null}
                </div>
              ))}
            <div className="row">
              <button className="btn btn-sm" onClick={() => setKioskFor(site)}>
                {t('sites.addKiosk')}
              </button>
              <button className="btn btn-sm" onClick={() => setEditing(site)}>
                {t('common.edit')}
              </button>
            </div>
          </section>
        ))}
      </div>
      {editing ? <SiteForm site={editing} onClose={() => setEditing(null)} /> : null}
      {kioskFor ? <NewKiosk site={kioskFor} onClose={() => setKioskFor(null)} /> : null}
    </>
  );
}

function SiteForm({ site, onClose }: { site: Partial<Site>; onClose: () => void }) {
  const { t } = useI18n();
  const { active } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: site.name ?? '',
    address: site.address ?? '',
    latitude: site.latitude?.toString() ?? '',
    longitude: site.longitude?.toString() ?? '',
    radius_m: String(site.radius_m ?? 150),
    geo_enabled: site.geo_enabled ?? false,
  });
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const values = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      radius_m: Number(form.radius_m),
      geo_enabled: form.geo_enabled,
    };
    const { error } = site.id
      ? await supabase.from('sites').update(values).eq('id', site.id)
      : await supabase.from('sites').insert({ ...values, company_id: active!.company_id });
    if (error) return setError(error);
    await queryClient.invalidateQueries({ queryKey: ['sites'] });
    onClose();
  };

  return (
    <Modal title={site.id ? site.name! : t('sites.add')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          {t('sites.name')}
          <input required value={form.name} onChange={set('name')} />
        </label>
        <label className="field">
          {t('sites.address')}
          <input value={form.address} onChange={set('address')} />
        </label>
        <div className="grid-3">
          <label className="field">
            {t('sites.latitude')}
            <input inputMode="decimal" value={form.latitude} onChange={set('latitude')} />
          </label>
          <label className="field">
            {t('sites.longitude')}
            <input inputMode="decimal" value={form.longitude} onChange={set('longitude')} />
          </label>
          <label className="field">
            {t('sites.radius')}
            <input type="number" min={30} max={2000} value={form.radius_m} onChange={set('radius_m')} />
          </label>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={form.geo_enabled} onChange={(e) => setForm((f) => ({ ...f, geo_enabled: e.target.checked }))} />
          {t('sites.geo')}
        </label>
        <div className="notice notice-warn small">{t('sites.geoWarning')}</div>
        <ErrorNotice error={error} />
        <div className="row">
          <span className="spacer" />
          <button className="btn btn-primary">{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function NewKiosk({ site, onClose }: { site: Site; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const kioskUrl = `${window.location.origin}/kiosk`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.rpc('create_kiosk', { p_site_id: site.id, p_name: name.trim() });
    if (error) return setError(error);
    setCode((data as { pairing_code: string }).pairing_code);
    await queryClient.invalidateQueries({ queryKey: ['kiosks'] });
  };

  return (
    <Modal title={code ? t('sites.pairingTitle') : t('sites.addKiosk')} onClose={onClose}>
      {code ? (
        <div className="stack">
          <p>{t('sites.pairingBody', { url: kioskUrl })}</p>
          <div className="mono" style={{ fontSize: 40, letterSpacing: 8, textAlign: 'center', padding: 16 }}>
            {code}
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label className="field">
            {t('sites.kioskName')}
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <ErrorNotice error={error} />
          <div className="row">
            <span className="spacer" />
            <button className="btn btn-primary">{t('common.add')}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
