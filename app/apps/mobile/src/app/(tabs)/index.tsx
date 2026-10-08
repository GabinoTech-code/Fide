import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useT, type AppKey } from '../../i18n/app';
import { useBalances, useOutbox, useTodayPunches } from '../../lib/data';
import { useSession } from '../../lib/session';
import { Colors } from '../../theme/colors';
import { Body, Button, Card, Eyebrow, Fonts, Notice, Row, Screen, Title } from '../../ui/kit';

const LEAVE_LABEL: Record<string, string> = { FERIE: 'Ferie', ROL: 'ROL', EXFEST: 'Ex festività' };

export default function Home() {
  const { t, time } = useT();
  const { membership } = useSession();
  const punches = useTodayPunches();
  const { queue } = useOutbox();
  const balances = useBalances();

  const pending = queue.filter((q) => !q.rejected);
  const all = [
    ...(punches.data ?? []).map((p) => ({ type: p.punch_type, ts: p.device_ts })),
    ...pending.map((q) => ({ type: q.submission.punch_type, ts: q.submission.device_ts })),
  ].sort((a, b) => a.ts.localeCompare(b.ts));
  const last = all.at(-1);
  const firstName = membership?.full_name.split(' ')[0] ?? '';

  return (
    <Screen>
      <Eyebrow>{membership?.companies?.legal_name ?? ''}</Eyebrow>
      <Title>{t('home.greeting', { name: firstName })}</Title>

      <Card dark>
        <Text style={{ fontFamily: Fonts.mono, color: Colors.accentLight, fontSize: 40 }}>
          {last ? time(last.ts) : '--:--'}
        </Text>
        <Body light>{last ? t(last.type === 'in' ? 'home.lastIn' : 'home.lastOut', { time: time(last.ts) }) : t('home.none')}</Body>
        <Button kind="mint" icon="fichar" label={t('home.punchNow')} onPress={() => router.push('/(tabs)/timbra')} />
      </Card>

      {pending.length ? <Notice kind="warn">{t('home.queued', { n: pending.length })}</Notice> : null}

      {(balances.data ?? []).length ? (
        <Card>
          <Body muted>{t('home.balances', { year: new Date().getFullYear() })}</Body>
          <Row style={{ gap: 12 }}>
            {balances.data!.map((b) => (
              <View key={b.leave_type_id} style={{ flexGrow: 1, minWidth: 90, gap: 2 }}>
                <Text style={{ fontFamily: Fonts.display, fontSize: 26, color: Colors.textPrimary }}>{Number(b.remaining)}</Text>
                <Body muted>
                  {LEAVE_LABEL[b.code] ?? b.code} · {t(`unit.${b.unit}` as AppKey)} {t('home.remaining')}
                </Body>
              </View>
            ))}
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}
