// Entry gate: sends each user to the one screen their state allows.
import { ActivityIndicator, Alert, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useT } from '../i18n/app';
import { configured } from '../lib/env';
import { useSession } from '../lib/session';
import { Colors } from '../theme/colors';
import { Body, Button, Card, Screen, Title } from '../ui/kit';

export default function Gate() {
  const { t } = useT();
  const { ready, session, membership, keyState, pendingInvite, signOut } = useSession();
  const logout = async () => {
    try { await signOut(); }
    catch { Alert.alert(t('common.error'), t('push.error')); }
  };

  if (!configured) {
    return (
      <Screen>
        <Title>{t('config.title')}</Title>
        <Body muted>{t('config.body')}</Body>
      </Screen>
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  if (pendingInvite) return <Redirect href={{ pathname: '/invite/[token]', params: { token: pendingInvite } }} />;
  if (!membership) {
    return (
      <Screen>
        <Title>{t('nocompany.title')}</Title>
        <Card>
          <Body muted>{t('nocompany.body')}</Body>
          <Body muted>{t('nocompany.suspended')}</Body>
        </Card>
        <Button kind="secondary" label={t('common.signOut')} onPress={logout} />
      </Screen>
    );
  }
  if (keyState === 'missing' || keyState === 'replaced') {
    // A former employee cannot enrol a new phone: documents stay on the old one.
    if (membership.status === 'terminated') {
      return (
        <Screen>
          <Title>{t('former.title')}</Title>
          <Card>
            <Body muted>{t('former.noPhone', { company: membership.companies?.legal_name ?? '' })}</Body>
          </Card>
          <Button kind="secondary" label={t('common.signOut')} onPress={logout} />
        </Screen>
      );
    }
    return <Redirect href="/setup" />;
  }
  return <Redirect href="/(tabs)" />;
}
