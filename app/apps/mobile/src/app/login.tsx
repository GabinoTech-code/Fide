import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { useT } from '../i18n/app';
import { useSession } from '../lib/session';
import { FideLogo } from '../components/common/Icons';
import { Body, Button, Card, Eyebrow, Field, Notice, Screen, Title } from '../ui/kit';

export default function Login() {
  const { t } = useT();
  const { session, sendCode, verifyCode, pendingInvite } = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof TypeError ? t('common.offline') : (err as Error).message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  // Already signed in (e.g. the session arrived after a redirect here): go on.
  if (session) return <Redirect href="/" />;

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start', gap: 12, marginTop: 24 }}>
        <FideLogo size={44} color="#0B6E4F" />
        <Eyebrow>Fide</Eyebrow>
        <Title>{t('login.title')}</Title>
        <Body muted>{t('login.subtitle')}</Body>
      </View>
      {pendingInvite ? <Notice>{t('login.inviteHint')}</Notice> : null}
      <Card>
        {!sent ? (
          <>
            <Field
              label={t('login.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Button label={t('login.sendCode')} busy={busy} disabled={!email.includes('@')} onPress={() => run(async () => {
              await sendCode(email);
              setSent(true);
            })} />
          </>
        ) : (
          <>
            <Body>{t('login.codeSent', { email: email.trim().toLowerCase() })}</Body>
            <Field
              label={t('login.code')}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
            />
            <Button label={t('login.verify')} busy={busy} disabled={code.length !== 6} onPress={() => run(async () => {
              await verifyCode(email, code);
              router.replace('/');
            })} />
            <Button kind="secondary" label={t('login.changeEmail')} onPress={() => {
              setSent(false);
              setCode('');
            }} />
          </>
        )}
        {error ? <Notice kind="danger">{error}</Notice> : null}
      </Card>
    </Screen>
  );
}
