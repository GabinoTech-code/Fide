// First sign-in (or new phone): create this phone's keys and register them.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useT } from '../i18n/app';
import { useSession } from '../lib/session';
import { deviceLock, enrolDevice, unlock, type StoredKeys } from '../lib/vault';
import { BrandIcon } from '../components/common/Icons';
import { Colors } from '../theme/colors';
import { Body, Button, Card, Eyebrow, Mono, Notice, Screen, Title } from '../ui/kit';

export default function Setup() {
  const { t } = useT();
  const { membership, keyState, setKeys } = useSession();
  const [lock, setLock] = useState<'ok' | 'no_lock' | null>(null);
  const [created, setCreated] = useState<StoredKeys | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    deviceLock().then(setLock);
  }, []);

  if (!membership) return null;

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
    <Screen>
      <Eyebrow>{membership.companies?.legal_name ?? ''}</Eyebrow>
      <Title>{t('setup.title')}</Title>
      <Card>
        <BrandIcon name="cifrado" size={32} color={Colors.accent} />
        <Body>{t('setup.body')}</Body>
      </Card>
      {keyState === 'replaced' && !created ? <Notice kind="warn">{t('setup.replaced')}</Notice> : null}
      {lock === 'no_lock' ? <Notice kind="warn">{t('setup.lockRequired')}</Notice> : null}

      {created ? (
        <Card>
          <Body muted>{t('setup.fingerprint')}</Body>
          <Mono style={{ fontSize: 18, color: Colors.textPrimary, letterSpacing: 1 }}>{created.fingerprint}</Mono>
          <Body muted>{t('setup.fingerprintHint')}</Body>
          <Button
            label={t('common.continue')}
            onPress={() => {
              setKeys(created);
              router.replace('/(tabs)');
            }}
          />
        </Card>
      ) : (
        <Button label={t('setup.create')} icon="huella" busy={busy} disabled={lock !== 'ok'} onPress={create} />
      )}
      {error ? <Notice kind="danger">{error}</Notice> : null}
    </Screen>
  );
}
