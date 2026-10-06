import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/Brand';
import { ErrorNotice, PageHead } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export function SettingsPage() {
  const { t, formatDateTime } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const [added, setAdded] = useState(false);

  const passkeys = useQuery({
    queryKey: ['passkeys'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.passkey.list();
      if (error) throw error;
      return data ?? [];
    },
  });

  const register = async () => {
    setError(null);
    setAdded(false);
    const { error } = await supabase.auth.registerPasskey();
    if (error) return setError(error);
    setAdded(true);
    await passkeys.refetch();
  };

  return (
    <>
      <PageHead title={t('settings.title')} />
      <section className="card stack">
        <h2 className="row">
          <Icon name="passkey" /> {t('settings.passkeys')}
        </h2>
        <p className="muted">{t('settings.passkeysBody')}</p>
        {(passkeys.data ?? []).length === 0 ? (
          <p className="small muted">{t('settings.noPasskeys')}</p>
        ) : (
          <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
            {passkeys.data!.map((p) => (
              <li key={p.id}>
                <strong>{p.friendly_name ?? 'Passkey'}</strong>{' '}
                <span className="small muted">{p.created_at ? formatDateTime(p.created_at) : ''}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="btn btn-primary" onClick={register}>
            {t('settings.addPasskey')}
          </button>
          {added ? <span className="badge">{t('settings.passkeyAdded')}</span> : null}
        </div>
        <ErrorNotice error={error ?? passkeys.error} />
      </section>
    </>
  );
}
