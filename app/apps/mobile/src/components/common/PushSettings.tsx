import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '../../i18n/app';
import { useSession } from '../../lib/session';
import { disablePush, pushEnabled, pushSupported, registerPush } from '../../lib/push';
import { Button, Card, Notice, Small } from '../../ui/kit';

export function PushSettings() {
  const { t } = useT();
  const { membership, session, keys, keyState } = useSession();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [denied, setDenied] = useState(false);
  const keyId = keys?.deviceKeyId;
  const userId = session?.user.id;
  const eligible = pushSupported && membership?.status === 'active' && keyState === 'ok' && !!keyId && !!userId;
  const sync = useCallback(async () => {
    if (!eligible || !keyId || !userId) return;
    try {
      const wants = await pushEnabled(keyId);
      if (wants) {
        setEnabled(await registerPush(keyId, userId, false));
      } else setEnabled(false);
      setError(false);
    } catch { setError(true); }
  }, [eligible, keyId, userId]);
  useEffect(() => {
    if (!eligible) return;
    void Promise.resolve().then(sync);
    const state = AppState.addEventListener('change', (next) => { if (next === 'active') void sync(); });
    const token = Notifications.addPushTokenListener(() => { void sync(); });
    const received = Notifications.addNotificationReceivedListener(() => { void queryClient.invalidateQueries(); });
    return () => { state.remove(); token.remove(); received.remove(); };
  }, [eligible, queryClient, sync]);

  if (!eligible || !keyId || !userId) return null;
  const change = async () => {
    setBusy(true); setError(false); setDenied(false);
    try {
      if (enabled) { await disablePush(keyId); setEnabled(false); }
      else {
        const ok = await registerPush(keyId, userId, true);
        setEnabled(ok); setDenied(!ok);
      }
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  return <Card>
    <Small>{t('push.explain')}</Small>
    {error && <Notice kind="danger">{t('push.error')}</Notice>}
    {denied && <Notice>{t('push.denied')}</Notice>}
    <Button label={t(enabled ? 'push.disable' : 'push.enable')} disabled={busy} onPress={() => { void change(); }} />
    {denied && <Button label={t('push.settings')} onPress={() => { void Linking.openSettings().catch(() => setError(true)); }} />}
  </Card>;
}
