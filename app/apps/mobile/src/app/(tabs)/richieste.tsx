import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { italianWorkingDays } from '@fide/shared';
import { useT, type AppKey } from '../../i18n/app';
import { useBalances, useLeaveTypes, useMyCorrections, useMyLeave, type RequestStatus } from '../../lib/data';
import { useLiveQueries } from '../../lib/refresh';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../theme/colors';
import { Calendar, todayIso, type Range } from '../../ui/Calendar';
import { Badge, Button, Card, Chip, ChipGrid, Field, Fonts, Header, Notice, Row, Screen, SectionTitle, Segmented, Small, Strong } from '../../ui/kit';

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const statusKind = { pending: 'warn', approved: 'ok', rejected: 'danger', cancelled: 'muted' } as const;
const CORRECTION = 'correction';
const inFuture = (d: Date) => d.getTime() > Date.now();

export default function Requests() {
  const { t, format, time } = useT();
  const { membership } = useSession();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ mode?: string }>();
  const types = useLeaveTypes();
  const balances = useBalances();
  const leave = useMyLeave();
  const corrections = useMyCorrections();
  const refresh = useLiveQueries(types, balances, leave, corrections);

  const [choice, setChoice] = useState<string | null>(params.mode === CORRECTION ? CORRECTION : null);
  const [seenMode, setSeenMode] = useState(params.mode);
  const [range, setRange] = useState<Range>({ from: null, to: null });
  const [form, setForm] = useState({ hours: '', note: '', protocol: '', time: '', reason: '', punchType: 'in' as 'in' | 'out' });
  const [message, setMessage] = useState<{ kind: 'info' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Quick actions on the home screen open a given kind.
  if (params.mode !== seenMode) {
    setSeenMode(params.mode);
    setChoice(params.mode === CORRECTION ? CORRECTION : null);
  }

  const leaveTypes = types.data ?? [];
  // Ferie first: the request most people make; then any day-based type.
  const fallback = leaveTypes.find((x) => x.code === 'FERIE') ?? leaveTypes.find((x) => x.unit === 'days') ?? leaveTypes[0];
  const selected = choice ?? fallback?.id ?? null;
  const isCorrection = selected === CORRECTION;
  const type = leaveTypes.find((x) => x.id === selected) ?? null;
  const hoursType = type?.unit === 'hours';
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const short = (d: string) => format(`${d}T12:00:00Z`, { day: 'numeric', month: 'short' });
  const workingDays = range.from && range.to ? italianWorkingDays(range.from, range.to) : 0;
  const quantity = hoursType ? Number(form.hours.replace(',', '.')) : workingDays;
  const balance = balances.data?.find((b) => b.leave_type_id === type?.id);
  const left = balance ? Number(balance.remaining) - (quantity || 0) : null;

  let detail: string;
  if (isCorrection) {
    detail = range.from
      ? `${short(range.from)} · ${t(form.punchType === 'in' ? 'requests.in' : 'requests.out')}${TIME.test(form.time) ? ` ${form.time}` : ''}`
      : t('requests.pickDay');
  } else if (hoursType) {
    detail = range.from ? `${short(range.from)}${quantity > 0 ? ` · ${quantity} ${t('unit.hoursShort')}` : ''}` : t('requests.pickDay');
  } else {
    detail = range.from && range.to
      ? t('requests.rangeDays', { range: range.to === range.from ? short(range.from) : `${short(range.from)} – ${short(range.to)}`, n: workingDays })
      : t('requests.pickRange');
  }

  function choose(id: string) {
    setChoice(id);
    setRange({ from: null, to: null });
    setMessage(null);
  }

  async function submit() {
    if (!membership) return;
    setMessage(null);
    let insert: PromiseLike<{ error: unknown }>;
    if (isCorrection) {
      const m = form.time.match(TIME);
      if (!range.from || !m) return setMessage({ kind: 'danger', text: t('requests.invalidTime') });
      const when = new Date(`${range.from}T${m[1]!.padStart(2, '0')}:${m[2]}:00`);
      if (inFuture(when)) return setMessage({ kind: 'danger', text: t('requests.invalidDate') });
      if (form.reason.trim().length < 3) return setMessage({ kind: 'danger', text: t('requests.reasonRequired') });
      insert = supabase.from('punch_corrections').insert({
        company_id: membership.company_id,
        member_id: membership.id,
        punch_type: form.punchType,
        requested_ts: when.toISOString(),
        reason: form.reason.trim(),
      });
    } else {
      if (!type || !range.from || !range.to) return setMessage({ kind: 'danger', text: t('requests.invalidDate') });
      if (!(quantity > 0)) {
        return setMessage({ kind: 'danger', text: t(hoursType ? 'requests.invalidHours' : 'requests.noWorkingDays') });
      }
      insert = supabase.from('leave_requests').insert({
        company_id: membership.company_id,
        member_id: membership.id,
        leave_type_id: type.id,
        start_date: range.from,
        end_date: range.to,
        quantity,
        note: form.note.trim() || null,
        protocol_number: form.protocol.trim() || null,
      });
    }
    setBusy(true);
    const { error } = await insert;
    setBusy(false);
    if (error) return setMessage({ kind: 'danger', text: t('common.error') });
    setMessage({ kind: 'info', text: t('requests.sent') });
    setRange({ from: null, to: null });
    setForm({ hours: '', note: '', protocol: '', time: '', reason: '', punchType: 'in' });
    queryClient.invalidateQueries({ queryKey: [isCorrection ? 'my_corrections' : 'my_leave'] });
  }

  async function cancel(table: 'leave' | 'correction', id: string) {
    const fn = table === 'leave' ? 'cancel_leave_request' : 'cancel_punch_correction';
    const args = table === 'leave' ? { p_request_id: id } : { p_correction_id: id };
    const { error } = await supabase.rpc(fn, args);
    if (error) setMessage({ kind: 'danger', text: t('common.error') });
    queryClient.invalidateQueries({ queryKey: [table === 'leave' ? 'my_leave' : 'my_corrections'] });
  }

  const history = [
    ...(leave.data ?? []).map((r) => ({
      key: `l-${r.id}`,
      table: 'leave' as const,
      id: r.id,
      sort: r.start_date,
      title: r.leave_types?.name ?? '',
      detail: `${r.end_date !== r.start_date ? `${short(r.start_date)} – ${short(r.end_date)}` : short(r.start_date)} · ${Number(r.quantity)} ${t(r.leave_types?.unit === 'hours' ? 'unit.hoursShort' : 'unit.days')}`,
      status: r.status,
      byHr: Boolean(r.entered_by),
      note: r.decision_note,
    })),
    ...(corrections.data ?? []).map((c) => ({
      key: `c-${c.id}`,
      table: 'correction' as const,
      id: c.id,
      sort: c.requested_ts.slice(0, 10),
      title: `${t('requests.newCorrection')} · ${t(c.punch_type === 'in' ? 'requests.in' : 'requests.out')}`,
      detail: `${short(c.requested_ts.slice(0, 10))} · ${time(c.requested_ts)} · ${c.reason}`,
      status: c.status,
      byHr: Boolean(c.entered_by),
      note: c.decision_note,
    })),
  ].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.sort.localeCompare(a.sort));

  return (
    <Screen refresh={refresh}>
      <Header eyebrow={t('requests.eyebrow')} title={t('requests.title')} privacyLabel={t('tabs.privacy')} />

      <ChipGrid>
        {[
          ...leaveTypes.map((lt) => <Chip key={lt.id} label={lt.name} selected={selected === lt.id} onPress={() => choose(lt.id)} />),
          <Chip key={CORRECTION} label={t('requests.newCorrection')} selected={isCorrection} onPress={() => choose(CORRECTION)} />,
        ]}
      </ChipGrid>

      <Card>
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: Fonts.text, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: Colors.textSecondary }}>
            {t('requests.detail')}
          </Text>
          <Strong size={16}>{detail}</Strong>
        </View>

        {isCorrection ? (
          <Segmented
            value={form.punchType}
            onChange={(v) => setForm((f) => ({ ...f, punchType: v }))}
            options={[
              { value: 'in', label: t('requests.in') },
              { value: 'out', label: t('requests.out') },
            ]}
          />
        ) : null}

        <Calendar
          key={selected ?? ''}
          mode={isCorrection || hoursType ? 'single' : 'range'}
          value={range}
          onChange={setRange}
          max={isCorrection ? todayIso() : undefined}
        />

        {!isCorrection && left !== null && quantity > 0 ? (
          <Small color={left < 0 ? Colors.warningText : undefined}>
            {left < 0
              ? t('requests.overBalance', { n: Number(balance!.remaining) })
              : t(hoursType ? 'requests.remainingHours' : 'requests.remainingDays', { n: left.toLocaleString(), type: type?.name ?? '' })}
          </Small>
        ) : null}

        {isCorrection ? (
          <>
            <Field label={t('requests.time')} value={form.time} onChangeText={set('time')} placeholder="08:30" keyboardType="numbers-and-punctuation" maxLength={5} />
            <Field label={t('requests.reason')} value={form.reason} onChangeText={set('reason')} multiline />
          </>
        ) : (
          <>
            {hoursType ? <Field label={t('requests.hours')} value={form.hours} onChangeText={set('hours')} keyboardType="decimal-pad" placeholder="2" /> : null}
            {type?.requires_protocol ? <Field label={t('requests.protocol')} value={form.protocol} onChangeText={set('protocol')} /> : null}
            <Field label={t('requests.noteForManager')} value={form.note} onChangeText={set('note')} multiline />
          </>
        )}

        <Button label={t('requests.sendRequest')} busy={busy} onPress={submit} />
        {message ? <Notice kind={message.kind === 'info' ? 'info' : 'danger'}>{message.text}</Notice> : null}
      </Card>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('requests.history')}</SectionTitle>
        {history.length === 0 ? <Small>{t('requests.empty')}</Small> : null}
        {history.map((h) => (
          <HistoryItem
            key={h.key}
            title={h.title}
            detail={h.detail}
            status={h.status}
            byHr={h.byHr}
            note={h.note}
            onCancel={h.status === 'pending' ? () => cancel(h.table, h.id) : undefined}
          />
        ))}
      </View>
    </Screen>
  );
}

function HistoryItem({
  title,
  detail,
  status,
  byHr,
  note,
  onCancel,
}: {
  title: string;
  detail: string;
  status: RequestStatus;
  byHr: boolean;
  note: string | null;
  onCancel?: () => void;
}) {
  const { t } = useT();
  return (
    <Card style={{ borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 6 }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Strong>{title}</Strong>
          <Text style={{ fontFamily: Fonts.text, fontSize: 12, color: Colors.textSecondary }}>{detail}</Text>
        </View>
        <Badge label={t(`status.${status}` as AppKey)} kind={statusKind[status]} />
      </Row>
      {byHr ? <Badge label={t('requests.byHr')} kind="muted" /> : null}
      {note ? <Small>{t('requests.decisionNote', { note })}</Small> : null}
      {onCancel ? (
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontFamily: Fonts.textBold, fontSize: 13, color: Colors.danger }}>{t('requests.cancel')}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
