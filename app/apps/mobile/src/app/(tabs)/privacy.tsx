import { useState } from 'react';
import { Alert, Pressable, Share } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useT } from '../../i18n/app';
import { LANGUAGES } from '../../i18n/types';
import { clearLocalPunches } from '../../lib/outboxSqlite';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { DiagnosticsModal } from '../../components/modals/DiagnosticsModal';
import { Colors } from '../../theme/colors';
import { Badge, Body, Button, Card, Mono, Notice, Row, Screen, Title } from '../../ui/kit';

export default function Privacy() {
  const { t, lang, setLang } = useT();
  const { membership, keys, signOut } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState(false);

  const identity = useQuery({
    queryKey: ['identity', membership?.id],
    enabled: Boolean(membership),
    queryFn: async () => {
      const { data, error } = await supabase.from('member_identities').select('email, codice_fiscale').eq('member_id', membership!.id).maybeSingle();
      if (error) throw error;
      return data as { email: string | null; codice_fiscale: string | null } | null;
    },
  });

  async function exportData() {
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) return setMessage(t('common.error'));
    await Share.share({ title: 'fide-export.json', message: JSON.stringify(data, null, 2) });
  }

  function requestErasure() {
    Alert.alert(t('privacy.erasure'), t('privacy.erasureBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('privacy.erasure'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('gdpr_requests').insert({
            company_id: membership!.company_id,
            member_id: membership!.id,
            kind: 'erasure',
          });
          setMessage(error ? t('common.error') : t('privacy.erasureSent'));
        },
      },
    ]);
  }

  async function changeLanguage(code: (typeof LANGUAGES)[number]['code']) {
    setLang(code);
    await supabase.rpc('set_my_language', { p_language: code });
  }

  async function logout() {
    await clearLocalPunches(false);
    await signOut();
  }

  return (
    <Screen>
      <Title>{t('privacy.title')}</Title>
      {message ? <Notice>{message}</Notice> : null}

      <Card>
        <Body muted>{t('privacy.company')}</Body>
        <Body>{membership?.companies?.legal_name}</Body>
        <Body>{membership?.full_name}</Body>
        <Mono>{identity.data?.email}</Mono>
        <Mono>{identity.data?.codice_fiscale}</Mono>
      </Card>

      <Card>
        <Body muted>{t('privacy.device')}</Body>
        <Mono style={{ fontSize: 16, color: Colors.textPrimary }}>{keys?.fingerprint}</Mono>
        <Body muted>{t('privacy.fingerprintHint')}</Body>
      </Card>

      <Card>
        <Body muted>{t('privacy.what')}</Body>
        <Body>{t('privacy.whatBody')}</Body>
        <Button kind="secondary" icon="exportar" label={t('privacy.export')} onPress={exportData} />
        <Button kind="danger" icon="supresion" label={t('privacy.erasure')} onPress={requestErasure} />
      </Card>

      <Card>
        <Body muted>{t('privacy.language')}</Body>
        <Row>
          {LANGUAGES.map((l) => (
            <Pressable key={l.code} onPress={() => changeLanguage(l.code)} accessibilityRole="radio" accessibilityState={{ selected: l.code === lang }}>
              <Badge label={l.name === 'Italiano' ? 'Italiano' : l.nativeName} kind={l.code === lang ? 'ok' : 'muted'} />
            </Pressable>
          ))}
        </Row>
      </Card>

      <Button kind="secondary" label={t('privacy.diagnostics')} onPress={() => setDiagnostics(true)} />
      <Button kind="secondary" label={t('common.signOut')} onPress={logout} />
      <DiagnosticsModal visible={diagnostics} onClose={() => setDiagnostics(false)} />
    </Screen>
  );
}
