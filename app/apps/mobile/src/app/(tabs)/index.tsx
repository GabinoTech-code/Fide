import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { formerAccessUntil } from '@fide/shared';
import { useT, type AppKey } from '../../i18n/app';
import { buildNotices, formatDuration, workday } from '../../lib/dashboard';
import { useBalances, useDocuments, useLeaveTypes, useMyCorrections, useMyLeave, useOutbox, useTodayPunches } from '../../lib/data';
import { useClock, useLiveQueries } from '../../lib/refresh';
import { useSession } from '../../lib/session';
import { Colors } from '../../theme/colors';
import { Body, Button, Card, Fonts, Header, ListItem, QuickAction, Row, Screen, SectionTitle, Small } from '../../ui/kit';

export default function Home() {
  const { t, time, date, format } = useT();
  const { membership } = useSession();
  const punches = useTodayPunches();
  const { queue } = useOutbox();
  const balances = useBalances();
  const types = useLeaveTypes();
  const docs = useDocuments();
  const leave = useMyLeave();
  const corrections = useMyCorrections();
  const refresh = useLiveQueries(punches, balances, docs, leave, corrections);

  const pending = queue.filter((q) => !q.rejected);
  const dayPunches = [
    ...(punches.data ?? []).map((p) => ({ type: p.punch_type, ts: p.device_ts })),
    ...pending.map((q) => ({ type: q.submission.punch_type, ts: q.submission.device_ts })),
  ];
  // The timer ticks only while a shift is open.
  const open = dayPunches.length > 0 && [...dayPunches].sort((a, b) => a.ts.localeCompare(b.ts)).at(-1)!.type === 'in';
  const now = useClock(open);
  const day = workday(dayPunches, now);

  const firstName = membership?.full_name.split(' ')[0] ?? '';
  const today = format(new Date(), { weekday: 'long', day: 'numeric', month: 'short' });
  const when = (iso: string) => format(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (membership?.status === 'terminated' && membership.terminated_on) {
    return (
      <Screen refresh={refresh}>
        <Header eyebrow={membership.companies?.legal_name ?? ''} title={t('home.greeting', { name: firstName })} privacyLabel={t('tabs.privacy')} />
        <Card dark>
          <Text style={{ fontFamily: Fonts.display, fontSize: 20, color: Colors.bg }}>{t('former.title')}</Text>
          <Body light>
            {t('former.banner', {
              company: membership.companies?.legal_name ?? '',
              day: date(membership.terminated_on),
              until: date(formerAccessUntil(membership.terminated_on)),
            })}
          </Body>
          <Button kind="mint" icon="docs" label={t('former.toDocuments')} onPress={() => router.navigate('/(tabs)/documenti')} />
        </Card>
      </Screen>
    );
  }

  const status =
    day.state === 'in'
      ? t('home.statusIn', { time: time(day.since!) })
      : day.state === 'out'
        ? t('home.statusOut', { time: time(day.since!) })
        : t('home.statusNone');
  const notices = buildNotices({ documents: docs.data ?? [], leave: leave.data ?? [], corrections: corrections.data ?? [] }, now);
  const typeName = (id: string) => types.data?.find((x) => x.id === id)?.name;

  return (
    <Screen refresh={refresh}>
      <Header eyebrow={today} title={t('home.greeting', { name: firstName })} privacyLabel={t('tabs.privacy')} />

      <Card dark>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <Small light>{status}</Small>
          <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.darkPill }}>
            <Text style={{ fontFamily: Fonts.text, fontSize: 12, color: pending.length ? Colors.warningBg : Colors.accentLight }}>
              {pending.length ? t('home.pillQueued', { n: pending.length }) : t('home.pillSynced')}
            </Text>
          </View>
        </Row>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 40, letterSpacing: -1, color: Colors.bg }} accessibilityLabel={t('home.worked')}>
          {formatDuration(day.workedMs)}
        </Text>
        <Button
          kind="mint"
          label={t(day.state === 'in' ? 'home.ctaOut' : 'home.ctaIn')}
          onPress={() => router.navigate('/(tabs)/timbra')}
        />
      </Card>

      {(balances.data ?? []).length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {balances.data!.map((b) => (
            <Card key={b.leave_type_id} style={{ flexGrow: 1, flexBasis: '45%', gap: 4 }}>
              <Small>{typeName(b.leave_type_id) ?? b.code}</Small>
              <Text style={{ fontFamily: Fonts.display, fontSize: 26, color: Colors.textPrimary }}>
                {Number(b.remaining).toLocaleString()}{' '}
                <Text style={{ fontFamily: Fonts.textMedium, fontSize: 14, color: Colors.textSecondary }}>
                  {t(b.unit === 'hours' ? 'unit.hoursShort' : 'unit.days')}
                </Text>
              </Text>
            </Card>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <QuickAction icon="vacaciones" label={t('home.quick.leave')} onPress={() => router.navigate('/(tabs)/richieste?mode=leave')} />
        <QuickAction icon="olvidado" label={t('home.quick.forgot')} onPress={() => router.navigate('/(tabs)/richieste?mode=correction')} />
        <QuickAction icon="docs" label={t('home.quick.docs')} onPress={() => router.navigate('/(tabs)/documenti')} />
        <QuickAction icon="misdatos" label={t('home.quick.privacy')} onPress={() => router.navigate('/(tabs)/privacy')} />
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle>{t('home.notices')}</SectionTitle>
        {notices.length === 0 ? <Small>{t('home.noticesEmpty')}</Small> : null}
        {notices.slice(0, 5).map((n) =>
          n.kind === 'document' ? (
            <ListItem
              key={`d-${n.id}`}
              icon="cifrado"
              tone="mint"
              title={t('home.notice.document', { title: n.title })}
              subtitle={t('home.notice.documentSub', { when: when(n.at) })}
              onPress={() => router.navigate('/(tabs)/documenti')}
            />
          ) : (
            <ListItem
              key={`${n.kind}-${n.id}`}
              icon={n.kind === 'leave' ? 'vacaciones' : 'olvidado'}
              tone={n.status === 'approved' ? 'mint' : 'danger'}
              title={`${n.kind === 'leave' ? n.label : t('requests.newCorrection')} · ${t(`status.${n.status}` as AppKey)}`}
              subtitle={t('home.notice.decidedSub', { when: when(n.at) })}
              onPress={() => router.navigate('/(tabs)/richieste')}
            />
          ),
        )}
      </View>
    </Screen>
  );
}
