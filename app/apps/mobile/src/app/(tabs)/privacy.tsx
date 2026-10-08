import { useState } from 'react';
import { Alert, Pressable, Share } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useT, type AppKey } from '../../i18n/app';
import { LANGUAGES } from '../../i18n/types';
import { clearLocalPunches } from '../../lib/outboxSqlite';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { DiagnosticsModal } from '../../components/modals/DiagnosticsModal';
import { Colors } from '../../theme/colors';
import { Badge, Body, Button, Card, Mono, Notice, Row, Screen, Title } from '../../ui/kit';

interface GdprRequest {
  id: string;
  kind: 'access' | 'portability' | 'erasure' | 'rectification' | 'objection';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  created_at: string;
  due_at: string;
  extension_note: string | null;
  resolution_note: string | null;
}

const gdprBadge = { pending: 'warn', in_progress: 'warn', completed: 'ok', rejected: 'danger' } as const;

export default function Privacy() {
  const { t, lang, setLang, date } = useT();
  const queryClient = useQueryClient();
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

  // The employee's own requests and HR's answers (art. 12: answer within one month).
  const requests = useQuery({
    queryKey: ['my_gdpr', membership?.id],
    enabled: Boolean(membership),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gdpr_requests')
        .select('id, kind, status, created_at, due_at, extension_note, resolution_note')
        .eq('member_id', membership!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as GdprRequest[];
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
          if (!error) queryClient.invalidateQueries({ queryKey: ['my_gdpr'] });
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

      {(requests.data ?? []).length ? (
        <Card>
          <Body muted>{t('privacy.myRequests')}</Body>
          {requests.data!.map((r) => (
            <Card key={r.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body>
                  {t(`gdpr.kind.${r.kind}` as AppKey)} · {date(r.created_at)}
                </Body>
                <Badge label={t(`gdpr.status.${r.status}` as AppKey)} kind={gdprBadge[r.status]} />
              </Row>
              {r.status === 'pending' || r.status === 'in_progress' ? <Body muted>{t('privacy.dueBy', { date: date(r.due_at) })}</Body> : null}
              {r.extension_note ? <Body muted>{t('privacy.extendedNote', { note: r.extension_note })}</Body> : null}
              {r.resolution_note ? <Body>{t('privacy.answerText', { note: r.resolution_note })}</Body> : null}
            </Card>
          ))}
        </Card>
      ) : null}

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
