// First sign-in (or new phone): create this phone's keys and register them.
import { useEffect, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useT } from '../i18n/app';
import { PasskeyCancelled, passkeySupported, registerPasskey } from '../lib/passkey';
import { useSession } from '../lib/session';
import { deviceLock, enrolDevice, unlock, type StoredKeys } from '../lib/vault';
import { BrandIcon } from '../components/common/Icons';
import { Colors } from '../theme/colors';
import { Button, Eyebrow, Fonts, Notice, Screen, Small } from '../ui/kit';

const panel = { backgroundColor: Colors.darkCard, borderWidth: 1, borderColor: Colors.darkBorder, borderRadius: 18, padding: 18, gap: 10 } as const;

export default function Setup() {
  const { t } = useT();
  const { membership, keyState, setKeys } = useSession();
  const [lock, setLock] = useState<'ok' | 'no_lock' | null>(null);
  const [created, setCreated] = useState<StoredKeys | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checked again on return from Settings, where the user sets the screen lock.
  useEffect(() => {
    deviceLock().then(setLock);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') deviceLock().then(setLock);
    });
    return () => sub.remove();
  }, []);

  if (!membership) return null;

  const finish = (k: StoredKeys) => {
    setKeys(k);
    router.replace('/(tabs)');
  };

  // As in the prototype: "activate with passkey" right after the keys, so the next sign-in needs no code.
  const activatePasskey = async () => {
    if (!created) return;
    setBusy(true);
    setError(null);
    try {
      await registerPasskey();
      finish(created);
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setError(err instanceof TypeError ? t('common.offline') : t('passkey.failed'));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlock(t('unlock.keys'), t('unlock.fallback'));
      const label = `${Platform.OS} ${Platform.Version}`;
      setCreated(await enrolDevice(membership.id, membership.company_id, label));
    } catch (err) {
      setError(err instanceof TypeError ? t('common.offline') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen dark>
      <StatusBar style="light" />
      <View style={{ gap: 10 }}>
        <Eyebrow light>{membership.companies?.legal_name ?? ''}</Eyebrow>
        <Text style={{ fontFamily: Fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: Colors.bg }}>{t('setup.title')}</Text>
      </View>

      <View style={panel}>
        <BrandIcon name="cifrado" size={28} color={Colors.accentLight} />
        <Text style={{ fontFamily: Fonts.text, fontSize: 15, lineHeight: 22, color: Colors.darkText }}>{t('setup.body')}</Text>
      </View>
      {keyState === 'replaced' && !created ? <Notice kind="warn">{t('setup.replaced')}</Notice> : null}
      {lock === 'no_lock' ? <Notice kind="warn">{t('setup.lockRequired')}</Notice> : null}

      <View style={{ flex: 1, minHeight: 12 }} />

      {created ? (
        <View style={panel}>
          <Small light>{t('setup.fingerprint')}</Small>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 18, letterSpacing: 1, color: Colors.accentLight }}>{created.fingerprint}</Text>
          <Small light>{t('setup.fingerprintHint')}</Small>
          {passkeySupported() ? (
            <>
              <Text style={{ fontFamily: Fonts.textBold, fontSize: 15, color: Colors.bg, marginTop: 8 }}>{t('passkey.offerTitle')}</Text>
              <Small light>{t('passkey.offerBody')}</Small>
              <Button kind="mint" icon="passkey" label={t('passkey.activate')} busy={busy} onPress={activatePasskey} />
              <Button kind="soft" label={t('passkey.later')} disabled={busy} onPress={() => finish(created)} />
            </>
          ) : (
            <Button kind="mint" label={t('common.continue')} onPress={() => finish(created)} />
          )}
        </View>
      ) : (
        <Button kind="mint" label={t('setup.create')} icon="huella" busy={busy} disabled={lock !== 'ok'} onPress={create} />
      )}
      {error ? <Notice kind="danger">{error}</Notice> : null}
      <View style={{ alignItems: 'center' }}>
        <Small light>{t('login.footer')}</Small>
      </View>
    </Screen>
  );
}
