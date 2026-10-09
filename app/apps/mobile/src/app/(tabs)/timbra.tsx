// Clocking in/out: kiosk QR everywhere, on-device geofence only where the site
// allows it (QR-first, art. 4 L. 300/1970). Every punch is signed after a
// biometric/PIN check, queued locally and synced; the server receipt is shown.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useT, type AppKey } from '../../i18n/app';
import { useOutbox, useSites, useTodayPunches } from '../../lib/data';
import { evaluateGeofence } from '../../lib/geofence';
import { useLiveQueries } from '../../lib/refresh';
import { enqueue } from '../../lib/outbox';
import { sqliteOutbox } from '../../lib/outboxSqlite';
import { buildPunch, uuidFromBytes } from '../../lib/punch';
import { scannedToken } from '../../lib/scanStore';
import { useSession } from '../../lib/session';
import { getSodium } from '../../lib/sodium';
import { unlock } from '../../lib/vault';
import { Colors } from '../../theme/colors';
import { Badge, Body, Button, Card, Fonts, Mono, Notice, Row, Screen, Title } from '../../ui/kit';

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

  // Default: the member's own site, else the first one.
  const site =
    sites.data?.find((s) => s.id === (siteId ?? membership?.site_id)) ?? sites.data?.[0] ?? null;

  const timeline = useMemo(() => {
    const server = (punches.data ?? []).map((p) => ({
      key: p.id,
      type: p.punch_type,
      ts: p.device_ts,
      // Recorded by HR on the employee's behalf: no device signature, shown as such.
      status: p.flags.includes('hr_entry')
        ? { kind: 'muted' as const, text: t('punch.byHr') }
        : { kind: 'ok' as const, text: t('punch.statusSent', { code: p.receipt_code }) },
    }));
    const local = queue.map((q) => ({
      key: q.submission.client_punch_id,
      type: q.submission.punch_type,
      ts: q.submission.device_ts,
      status: q.rejected
        ? { kind: 'danger' as const, text: t('punch.statusRejected', { reason: rejectText(q.rejected) }) }
        : { kind: 'warn' as const, text: t('punch.statusQueued') },
    }));
    return [...server, ...local].sort((a, b) => a.ts.localeCompare(b.ts));
  }, [punches.data, queue, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastActive = timeline.filter((e) => e.status.kind !== 'danger').at(-1);
  const nextType: 'in' | 'out' = lastActive?.type === 'in' ? 'out' : 'in';

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
      <Screen>
        <Title>{t('punch.title')}</Title>
        <Notice kind="warn">{t('punch.noSite')}</Notice>
      </Screen>
    );
  }

  return (
    <Screen refresh={refresh}>
      <Title>{t('punch.title')}</Title>

      {(sites.data ?? []).length > 1 ? (
        <Row>
          {sites.data!.map((s) => (
            <Pressable key={s.id} onPress={() => setSiteId(s.id)} accessibilityRole="radio" accessibilityState={{ selected: s.id === site?.id }}>
              <Badge label={s.name} kind={s.id === site?.id ? 'ok' : 'muted'} />
            </Pressable>
          ))}
        </Row>
      ) : null}

      <Card dark>
        <Body light>{site?.name ?? ''}</Body>
        <Text style={{ fontFamily: Fonts.display, fontSize: 34, color: Colors.textWhite }}>
          {t(nextType === 'in' ? 'punch.nextIn' : 'punch.nextOut')}
        </Text>
        <Button kind="mint" icon="qr" label={t('punch.withQr')} busy={busy} onPress={() => router.push('/scan')} />
        {site?.geo_enabled ? <Button kind="secondary" icon="geo" label={t('punch.withGeo')} disabled={busy} onPress={punchWithLocation} /> : null}
        {site?.geo_enabled ? <Body light>{t('punch.privacy')}</Body> : null}
      </Card>

      {feedback ? <Notice kind={feedback.kind}>{feedback.text}</Notice> : null}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body muted>{t('punch.today')}</Body>
          {queue.some((q) => !q.rejected) ? <Button kind="secondary" label={t('punch.syncNow')} onPress={() => sync().catch(() => undefined)} /> : null}
        </Row>
        {timeline.map((e) => (
          <View key={e.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Mono style={{ fontSize: 16, color: Colors.textPrimary }}>
              {time(e.ts)} · {t(e.type === 'in' ? 'punch.nextIn' : 'punch.nextOut')}
            </Mono>
            <Badge label={e.status.text} kind={e.status.kind} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
