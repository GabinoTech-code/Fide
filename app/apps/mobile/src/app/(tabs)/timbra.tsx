// Clocking in/out: kiosk QR everywhere, on-device geofence only where the site
// allows it (QR-first, art. 4 L. 300/1970). Every punch is signed after a
// biometric/PIN check, queued locally and synced; the server receipt is shown.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useT, type AppKey } from '../../i18n/app';
import { useOutbox, useSites, useTodayPunches } from '../../lib/data';
import { evaluateGeofence } from '../../lib/geofence';
import { useClock, useLiveQueries } from '../../lib/refresh';
import { enqueue } from '../../lib/outbox';
import { sqliteOutbox } from '../../lib/outboxSqlite';
import { buildPunch, uuidFromBytes } from '../../lib/punch';
import { scannedToken } from '../../lib/scanStore';
import { useSession } from '../../lib/session';
import { getSodium } from '../../lib/sodium';
import { unlock } from '../../lib/vault';
import { Colors } from '../../theme/colors';
import { formatDuration, workday } from '../../lib/dashboard';
import { Button, Card, Chip, ChipGrid, Fonts, Header, ListItem, Mono, Notice, Screen, SectionTitle, Small } from '../../ui/kit';

type Feedback = { kind: 'info' | 'warn' | 'danger'; text: string } | null;

export default function Punch() {
  const { t, time } = useT();
  const { membership, keys } = useSession();
  const sites = useSites();
  const punches = useTodayPunches();
  const { queue, reload, sync } = useOutbox();
  const refresh = useLiveQueries(sites, punches);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [method, setMethod] = useState<'qr' | 'geo'>('qr');

  // Default: the member's own site, else the first one.
  const site =
    sites.data?.find((s) => s.id === (siteId ?? membership?.site_id)) ?? sites.data?.[0] ?? null;

  const timeline = useMemo(() => {
    const server = (punches.data ?? []).map((p) => ({
      key: p.id,
      type: p.punch_type,
      method: p.method,
      ts: p.device_ts,
      // Recorded by HR on the employee's behalf: no device signature, shown as such.
      status: p.flags.includes('hr_entry')
        ? { kind: 'muted' as const, text: t('punch.byHr') }
        : { kind: 'ok' as const, text: t('punch.statusSent', { code: p.receipt_code }) },
    }));
    const local = queue.map((q) => ({
      key: q.submission.client_punch_id,
      type: q.submission.punch_type,
      method: q.submission.method as 'geo' | 'qr' | 'manual',
      ts: q.submission.device_ts,
      status: q.rejected
        ? { kind: 'danger' as const, text: t('punch.statusRejected', { reason: rejectText(q.rejected) }) }
        : { kind: 'warn' as const, text: t('punch.statusQueued') },
    }));
    return [...server, ...local].sort((a, b) => a.ts.localeCompare(b.ts));
  }, [punches.data, queue, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastActive = timeline.filter((e) => e.status.kind !== 'danger').at(-1);
  const nextType: 'in' | 'out' = lastActive?.type === 'in' ? 'out' : 'in';
  const now = useClock(nextType === 'out');
  const day = workday(timeline.filter((e) => e.status.kind !== 'danger'), now);
  // Geofence only where the site allows it (art. 4 L. 300/1970); QR always.
  const activeMethod = site?.geo_enabled ? method : 'qr';

  function rejectText(code: string) {
    const key = `reject.${code}` as AppKey;
    const text = t(key);
    return text === key ? t('reject.other') : text;
  }

  async function punch(method: 'qr' | 'geo', evidence: { qrToken?: string; inGeofence?: boolean; mocked?: boolean }) {
    if (!membership || !keys || !site) return;
    setBusy(true);
    setFeedback(null);
    try {
      await unlock(t('unlock.punch'), t('unlock.fallback'));
      const sodium = await getSodium();
      const submission = buildPunch(
        sodium,
        {
          companyId: membership.company_id,
          memberId: membership.id,
          deviceKeyId: keys.deviceKeyId,
          siteId: site.id,
          method,
          punchType: nextType,
          qrToken: evidence.qrToken,
          inGeofence: evidence.inGeofence,
          mockLocation: evidence.mocked,
        },
        keys.ed25519PrivateKey,
        () => uuidFromBytes(sodium.randombytes_buf(16)),
      );
      await enqueue(sqliteOutbox, submission);
      await reload();
      const summary = await sync().catch(() => null);
      const refused = summary?.rejected.find((r) => r.client_punch_id === submission.client_punch_id);
      const receipt = (await sqliteOutbox.receipts(submission.device_ts)).find(
        (r) => r.client_punch_id === submission.client_punch_id,
      );
      if (refused) setFeedback({ kind: 'danger', text: t('punch.statusRejected', { reason: rejectText(refused.error) }) });
      else if (receipt) setFeedback({ kind: 'info', text: t('punch.sent', { code: receipt.receipt_code }) });
      else setFeedback({ kind: 'warn', text: t('punch.signed') });
    } catch {
      setFeedback({ kind: 'danger', text: t('unlock.failed') });
    } finally {
      setBusy(false);
    }
  }

  // The scanner hands the token back here.
  useEffect(() => scannedToken.listen((token) => punch('qr', { qrToken: token })));

  async function punchWithLocation() {
    if (!site || site.latitude === null || site.longitude === null) return;
    setFeedback({ kind: 'info', text: t('punch.checkingLocation') });
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return setFeedback({ kind: 'warn', text: t('punch.locationDenied') });
    try {
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const result = evaluateGeofence(
        { latitude: site.latitude, longitude: site.longitude, radius_m: site.radius_m },
        { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy },
      );
      // The fix is dropped here: only the yes/no below leaves this function.
      if (result.status === 'low_accuracy') {
        return setFeedback({ kind: 'warn', text: t('punch.lowAccuracy', { a: Math.round(result.accuracyM ?? 0) }) });
      }
      if (result.status === 'outside') {
        return setFeedback({ kind: 'warn', text: t('punch.outside', { d: result.distanceM }) });
      }
      await punch('geo', { inGeofence: true, mocked: fix.mocked === true });
    } catch {
      setFeedback({ kind: 'warn', text: t('punch.lowAccuracy', { a: '?' }) });
    }
  }

  if (sites.data && !sites.data.length) {
    return (
      <Screen refresh={refresh}>
        <Header eyebrow={t('punch.eyebrow')} title={t('punch.title')} privacyLabel={t('tabs.privacy')} />
        <Notice kind="warn">{t('punch.noSite')}</Notice>
      </Screen>
    );
  }

  const queued = queue.filter((q) => !q.rejected).length;
  const inNext = nextType === 'in';

  return (
    <Screen refresh={refresh}>
      <Header eyebrow={t('punch.eyebrow')} title={t('punch.title')} privacyLabel={t('tabs.privacy')} />

      {(sites.data ?? []).length > 1 ? (
        <ChipGrid>
          {sites.data!.map((s) => (
            <Chip key={s.id} label={s.name} selected={s.id === site?.id} onPress={() => setSiteId(s.id)} />
          ))}
        </ChipGrid>
      ) : null}

      <View style={{ alignItems: 'center', gap: 14, paddingVertical: 8 }}>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 34, color: Colors.textPrimary }}>{formatDuration(day.workedMs)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t(inNext ? 'punch.nextIn' : 'punch.nextOut')} · ${t(`punch.method.${activeMethod}`)}`}
          disabled={busy || !site}
          onPress={() => (activeMethod === 'qr' ? router.push('/scan') : punchWithLocation())}
          style={({ pressed }) => ({
            width: 168,
            height: 168,
            borderRadius: 84,
            borderWidth: 10,
            borderColor: inNext ? Colors.accentRing : Colors.chipBorder,
            backgroundColor: inNext ? Colors.accent : Colors.dark,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            opacity: pressed || busy ? 0.85 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator color={Colors.textWhite} />
          ) : (
            <>
              <Text style={{ fontFamily: Fonts.display, fontSize: 22, color: Colors.textWhite }}>{t(inNext ? 'punch.nextIn' : 'punch.nextOut')}</Text>
              <Text style={{ fontFamily: Fonts.text, fontSize: 12, color: Colors.textWhite, opacity: 0.85 }}>{t(`punch.method.${activeMethod}`)}</Text>
            </>
          )}
        </Pressable>
        {site && (sites.data ?? []).length === 1 ? <Small>{site.name}</Small> : null}
      </View>

      {feedback ? <Notice kind={feedback.kind}>{feedback.text}</Notice> : null}

      <View style={{ gap: 10 }}>
        <SectionTitle>{t('punch.verification')}</SectionTitle>
        {site?.geo_enabled ? (
          <ChipGrid>
            <Chip label={t('punch.method.qr')} selected={activeMethod === 'qr'} onPress={() => setMethod('qr')} />
            <Chip label={t('punch.method.geo')} selected={activeMethod === 'geo'} onPress={() => setMethod('geo')} />
          </ChipGrid>
        ) : null}
        <Notice>{t(activeMethod === 'qr' ? 'punch.info.qr' : 'punch.info.geo')}</Notice>
      </View>

      {queued ? (
        <Card style={{ gap: 8 }}>
          <Text style={{ fontFamily: Fonts.textBold, fontSize: 14, color: Colors.textPrimary }}>{t('home.queued', { n: queued })}</Text>
          <Small>{t('punch.queueHint')}</Small>
          <Button kind="secondary" label={t('punch.syncNow')} onPress={() => sync().catch(() => undefined)} />
        </Card>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('punch.today')}</SectionTitle>
        {timeline.length === 0 ? <Small>{t('punch.none')}</Small> : null}
        {timeline.map((e) => (
          <ListItem
            key={e.key}
            title={`${t(e.type === 'in' ? 'punch.nextIn' : 'punch.nextOut')} · ${t(`punch.method.${e.method}`)}`}
            subtitle={e.status.text}
            subtitleColor={STATUS_COLOR[e.status.kind]}
            trailing={<Mono style={{ fontSize: 16, color: Colors.textPrimary }}>{time(e.ts)}</Mono>}
          />
        ))}
      </View>
    </Screen>
  );
}

const STATUS_COLOR = { ok: Colors.success, muted: Colors.textSecondary, warn: Colors.warningText, danger: Colors.danger } as const;
