import { useEffect, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useT, type AppKey } from '../../i18n/app';
import { LANGUAGES } from '../../i18n/types';
import { clearLocalPunches } from '../../lib/outboxSqlite';
import { hasPasskeyHere, PasskeyCancelled, passkeySupported, registerPasskey } from '../../lib/passkey';
import { useLiveQueries } from '../../lib/refresh';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { AccessLine } from '../../components/AccessLine';
import { DiagnosticsModal } from '../../components/modals/DiagnosticsModal';
import { useAccessEvents, useDocuments } from '../../lib/data';
import { Colors } from '../../theme/colors';
import { Badge, Body, Button, Card, Chip, ChipGrid, Header, Mono, Notice, Row, Screen, SectionTitle, Small, Strong } from '../../ui/kit';

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
  const [passkeyHere, setPasskeyHere] = useState(false);

  useEffect(() => {
    hasPasskeyHere().then(setPasskeyHere);
  }, []);

  async function activatePasskey() {
    try {
      await registerPasskey();
      setPasskeyHere(true);
      setMessage(t('passkey.activated'));
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setMessage(t('passkey.failed'));
    }
  }

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
  const events = useAccessEvents();
  const docs = useDocuments();
  const refresh = useLiveQueries(identity, requests, events);
  const titles = new Map((docs.data ?? []).map((d) => [d.id, d.title]));

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
    <Screen refresh={refresh}>
      <Header
        eyebrow={t('privacy.eyebrow')}
        title={t('privacy.title')}
        closeLabel={t('docs.close')}
        onClose={() => (router.canGoBack() ? router.back() : router.navigate('/(tabs)'))}
      />
      {message ? <Notice>{message}</Notice> : null}

      <Card>
        <Strong size={15}>{t('privacy.seesTitle')}</Strong>
        {(['punches', 'docs', 'data'] as const).map((k) => (
          <View key={k} style={{ gap: 2 }}>
            <Strong>{t(`privacy.sees.${k}` as AppKey)}</Strong>
            <Small>{t(`privacy.sees.${k}Body` as AppKey)}</Small>
          </View>
        ))}
      </Card>

      <Card>
        <Small>{t('privacy.company')}</Small>
        <Strong size={15}>{membership?.companies?.legal_name}</Strong>
        <Body>{membership?.full_name}</Body>
        <Mono>{identity.data?.email}</Mono>
        <Mono>{identity.data?.codice_fiscale}</Mono>
      </Card>

      <Card>
        <Small>{t('privacy.device')}</Small>
        <Mono style={{ fontSize: 16, color: Colors.textPrimary, letterSpacing: 0.5 }}>{keys?.fingerprint}</Mono>
        <Small>{t('privacy.fingerprintHint')}</Small>
      </Card>

      <Card>
        <Small>{t('privacy.access')}</Small>
        {passkeyHere ? (
          <Body>{t('passkey.active')}</Body>
        ) : (
          <>
            <Small>{t('passkey.offerBody')}</Small>
            {passkeySupported() ? <Button kind="outline" icon="passkey" label={t('passkey.activate')} onPress={activatePasskey} /> : null}
          </>
        )}
      </Card>

      <Row style={{ flexWrap: 'nowrap' }}>
        <Button kind="outline" label={t('privacy.export')} onPress={exportData} style={{ flex: 1 }} />
        <Button kind="danger" label={t('privacy.erasure')} onPress={requestErasure} style={{ flex: 1 }} />
      </Row>

      {(requests.data ?? []).length ? (
        <View style={{ gap: 8 }}>
          <SectionTitle>{t('privacy.myRequests')}</SectionTitle>
          {requests.data!.map((r) => (
            <Card key={r.id} style={{ borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Strong>
                  {t(`gdpr.kind.${r.kind}` as AppKey)} · {date(r.created_at)}
                </Strong>
                <Badge label={t(`gdpr.status.${r.status}` as AppKey)} kind={gdprBadge[r.status]} />
              </Row>
              {r.status === 'pending' || r.status === 'in_progress' ? <Small>{t('privacy.dueBy', { date: date(r.due_at) })}</Small> : null}
              {r.extension_note ? <Small>{t('privacy.extendedNote', { note: r.extension_note })}</Small> : null}
              {r.resolution_note ? <Body>{t('privacy.answerText', { note: r.resolution_note })}</Body> : null}
            </Card>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <SectionTitle>{t('privacy.accessLog')}</SectionTitle>
        {(events.data ?? []).length === 0 ? <Small>{t('privacy.accessEmpty')}</Small> : null}
        {(events.data ?? []).slice(0, 8).map((e) => (
          <AccessLine key={e.id} event={e} me={membership?.id} title={titles.get(e.document_id)} />
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('privacy.language')}</SectionTitle>
        <ChipGrid columns={3}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.code === 'it' ? l.name : l.nativeName} selected={l.code === lang} onPress={() => changeLanguage(l.code)} />
          ))}
        </ChipGrid>
      </View>

      <Button kind="soft" label={t('privacy.diagnostics')} onPress={() => setDiagnostics(true)} />
      <Button kind="soft" label={t('common.signOut')} onPress={logout} />
      <DiagnosticsModal visible={diagnostics} onClose={() => setDiagnostics(false)} />
    </Screen>
  );
}
