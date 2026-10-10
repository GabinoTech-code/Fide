import { useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { useT, type AppKey } from '../i18n/app';
import { hasPasskeyHere, NoPasskeyHere, PasskeyCancelled, passkeySupported } from '../lib/passkey';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { FideLogo } from '../components/common/Icons';
import { Colors } from '../theme/colors';
import { Button, Field, Fonts, Notice, Screen, Small } from '../ui/kit';

interface InvitePreview {
  company_name: string;
  role: 'employee' | 'manager' | 'hr_admin' | 'company_owner';
  site_name: string | null;
}

export default function Login() {
  const { t } = useT();
  const { session, sendCode, verifyCode, signInWithPasskey, pendingInvite } = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [passkeyHere, setPasskeyHere] = useState(false);
  const [useCode, setUseCode] = useState(false);
  const canPasskey = passkeySupported();

  // The invitation's company, role and site, read with the e-mailed token (as in the prototype).
  useEffect(() => {
    if (!pendingInvite) return;
    supabase
      .rpc('invitation_preview', { p_token: pendingInvite })
      .then(({ data }) => setInvite(((data as InvitePreview[] | null) ?? [])[0] ?? null), () => undefined);
  }, [pendingInvite]);

  useEffect(() => {
    hasPasskeyHere().then(setPasskeyHere);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof PasskeyCancelled) return;
      if (err instanceof NoPasskeyHere) {
        setUseCode(true);
        setError(t('passkey.none'));
        return;
      }
      setError(err instanceof TypeError ? t('common.offline') : (err as Error).message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  // Already signed in (e.g. the session arrived after a redirect here): go on.
  if (session) return <Redirect href="/" />;

  // A new invitation always starts with the e-mail code: it proves the invited address.
  const passkeyFirst = canPasskey && passkeyHere && !pendingInvite && !useCode;
  const passkey = () =>
    run(async () => {
      await signInWithPasskey();
      router.replace('/');
    });

  return (
    <Screen dark>
      <StatusBar style="light" />
      <View style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <FideLogo size={34} color={Colors.accentLight} />
          <Text style={{ fontFamily: Fonts.display, fontSize: 28, letterSpacing: -0.5, color: Colors.bg }}>Fide</Text>
        </View>
        <Text style={{ marginTop: 24, fontFamily: Fonts.display, fontSize: 34, lineHeight: 37, letterSpacing: -0.8, color: Colors.bg }}>
          {t('login.headline')}
        </Text>
        <Text style={{ fontFamily: Fonts.text, fontSize: 15, lineHeight: 22, color: Colors.textLight }}>{t('login.tagline')}</Text>
      </View>

      <View style={{ flex: 1, minHeight: 24 }} />

      <View style={{ gap: 14 }}>
        {pendingInvite ? (
          <View style={{ backgroundColor: Colors.darkCard, borderWidth: 1, borderColor: Colors.darkBorder, borderRadius: 18, padding: 18, gap: 6 }}>
            <Text style={{ fontFamily: Fonts.text, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.textMuted }}>
              {t('login.inviteReceived')}
            </Text>
            <Text style={{ fontFamily: Fonts.textBold, fontSize: 17, color: Colors.bg }}>{invite?.company_name ?? t('login.inviteTitle')}</Text>
            {invite ? (
              <Text style={{ fontFamily: Fonts.text, fontSize: 14, color: Colors.textLight }}>
                {[t(`role.${invite.role}` as AppKey), invite.site_name].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            <Text style={{ fontFamily: Fonts.text, fontSize: 13, color: Colors.textMuted }}>{t('login.inviteHint')}</Text>
          </View>
        ) : null}

        {passkeyFirst ? (
          <>
            <Button kind="mint" icon="passkey" label={t('passkey.signIn')} busy={busy} onPress={passkey} />
            <Button kind="soft" label={t('passkey.useCode')} onPress={() => setUseCode(true)} />
          </>
        ) : !sent ? (
          <>
            <Field
              dark
              label={t('login.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Button
              kind="mint"
              label={t('login.sendCode')}
              busy={busy}
              disabled={!email.includes('@')}
              onPress={() =>
                run(async () => {
                  await sendCode(email);
                  setSent(true);
                })
              }
            />
            {canPasskey && !pendingInvite ? <Button kind="soft" icon="passkey" label={t('passkey.signIn')} disabled={busy} onPress={passkey} /> : null}
          </>
        ) : (
          <>
            <Text style={{ fontFamily: Fonts.text, fontSize: 15, lineHeight: 22, color: Colors.bg }}>
              {t('login.codeSent', { email: email.trim().toLowerCase() })}
            </Text>
            <Field
              dark
              label={t('login.code')}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
            />
            <Button
              kind="mint"
              label={t('login.verify')}
              busy={busy}
              disabled={code.length !== 6}
              onPress={() =>
                run(async () => {
                  await verifyCode(email, code);
                  router.replace('/');
                })
              }
            />
            <Button
              kind="soft"
              label={t('login.changeEmail')}
              onPress={() => {
                setSent(false);
                setCode('');
              }}
            />
          </>
        )}
        {error ? <Notice kind="danger">{error}</Notice> : null}
        <View style={{ alignItems: 'center' }}>
          <Small light>{t('login.footer')}</Small>
        </View>
      </View>
    </Screen>
  );
}
