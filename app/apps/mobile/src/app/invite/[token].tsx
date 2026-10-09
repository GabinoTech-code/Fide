// fide://invite/<token>: keeps the token through sign-in, then redeems it.
import { useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { INVITE_TOKEN_PATTERN } from '@fide/shared';
import { useT, type AppKey } from '../../i18n/app';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { StatusBar } from 'expo-status-bar';
import { FideLogo } from '../../components/common/Icons';
import { Colors } from '../../theme/colors';
import { Body, Button, Notice, Screen, Title } from '../../ui/kit';

const ERRORS: Record<string, AppKey> = {
  invitation_invalid: 'invite.invalid',
  invitation_email_mismatch: 'invite.mismatch',
  already_member: 'invite.already',
};

export default function Invite() {
  const { t } = useT();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, setPendingInvite, refresh, signOut } = useSession();
  const [error, setError] = useState<AppKey | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const malformed = !token || !INVITE_TOKEN_PATTERN.test(token);

  useEffect(() => {
    if (malformed) return;
    if (!session) {
      setPendingInvite(token).then(() => setNeedsLogin(true));
      return;
    }
    let cancelled = false;
    (async () => {
      const { error: rpcError } = await supabase.rpc('redeem_invitation', { p_token: token });
      if (cancelled) return;
      await setPendingInvite(null);
      if (rpcError) {
        const key = Object.entries(ERRORS).find(([code]) => rpcError.message.includes(code))?.[1];
        setError(key ?? 'invite.invalid');
        return;
      }
      await refresh();
      router.replace('/');
    })();
    return () => {
      cancelled = true;
    };
  }, [malformed, token, session, setPendingInvite, refresh]);

  if (needsLogin) return <Redirect href="/login" />;

  return (
    <Screen dark>
      <StatusBar style="light" />
      <FideLogo size={34} color={Colors.accentLight} />
      <Title light>{t('invite.title')}</Title>
      {error || malformed ? (
        <>
          <Notice kind="danger">{t(error ?? 'invite.invalid')}</Notice>
          {error === 'invite.mismatch' ? <Button kind="soft" label={t('common.signOut')} onPress={signOut} /> : null}
          <Button kind="mint" label={t('common.continue')} onPress={() => router.replace('/')} />
        </>
      ) : (
        <Body light>{t('invite.redeeming')}</Body>
      )}
    </Screen>
  );
}
