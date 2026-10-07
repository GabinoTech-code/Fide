import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useT, type AppKey } from '../../i18n/app';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { Badge, Body, Button, Card, Field, Mono, Notice, Row, Screen, Segmented, Title } from '../../ui/kit';

interface LeaveType {
  id: string;
  code: string;
  name: string;
  unit: 'days' | 'hours';
  requires_protocol: boolean;
}
interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  quantity: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  leave_types: { name: string; unit: 'days' | 'hours' } | null;
}
interface Correction {
  id: string;
  punch_type: 'in' | 'out';
  requested_ts: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/;
const statusKind = { pending: 'warn', approved: 'ok', rejected: 'danger', cancelled: 'muted' } as const;

export default function Requests() {
  const { t, date, time } = useT();
  const { membership } = useSession();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'leave' | 'correction'>('leave');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [form, setForm] = useState({ from: '', to: '', quantity: '', note: '', protocol: '', when: '', reason: '', punchType: 'in' as 'in' | 'out' });
  const [message, setMessage] = useState<{ kind: 'info' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const types = useQuery({
    queryKey: ['leave_types', membership?.company_id],
    enabled: Boolean(membership),
    queryFn: async () => {
      const { data, error } = await supabase.from('leave_types').select('id, code, name, unit, requires_protocol').eq('active', true).order('name');
      if (error) throw error;
      return data as LeaveType[];
    },
  });
  const leave = useQuery({
    queryKey: ['my_leave', membership?.id],
    enabled: Boolean(membership),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, start_date, end_date, quantity, status, leave_types(name, unit)')
        .eq('member_id', membership!.id)
        .order('start_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as LeaveRequest[];
    },
  });
  const corrections = useQuery({
    queryKey: ['my_corrections', membership?.id],
    enabled: Boolean(membership),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('punch_corrections')
        .select('id, punch_type, requested_ts, reason, status')
        .eq('member_id', membership!.id)
        .order('requested_ts', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as Correction[];
    },
  });

  const type = types.data?.find((x) => x.id === typeId) ?? null;
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!membership) return;
    setMessage(null);
    let insert: PromiseLike<{ error: unknown }>;
    if (mode === 'leave') {
      const to = form.to || form.from;
      if (!type || !DATE.test(form.from) || !DATE.test(to) || !(Number(form.quantity) > 0)) {
        return setMessage({ kind: 'danger', text: t('requests.invalidDate') });
      }
      insert = supabase.from('leave_requests').insert({
        company_id: membership.company_id,
        member_id: membership.id,
        leave_type_id: type.id,
        start_date: form.from,
        end_date: to,
        quantity: Number(form.quantity),
        note: form.note.trim() || null,
        protocol_number: form.protocol.trim() || null,
      });
    } else {
      const m = form.when.match(DATETIME);
      const when = m ? new Date(`${m[1]}T${m[2]}:${m[3]}:00`) : null;
      if (!when || Number.isNaN(when.getTime()) || form.reason.trim().length < 3) {
        return setMessage({ kind: 'danger', text: t('requests.invalidDate') });
      }
      insert = supabase.from('punch_corrections').insert({
        company_id: membership.company_id,
        member_id: membership.id,
        punch_type: form.punchType,
        requested_ts: when.toISOString(),
        reason: form.reason.trim(),
      });
    }
    setBusy(true);
    const { error } = await insert;
    setBusy(false);
    if (error) return setMessage({ kind: 'danger', text: t('common.error') });
    setMessage({ kind: 'info', text: t('requests.sent') });
    setForm({ from: '', to: '', quantity: '', note: '', protocol: '', when: '', reason: '', punchType: 'in' });
    queryClient.invalidateQueries({ queryKey: [mode === 'leave' ? 'my_leave' : 'my_corrections'] });
  }

  async function cancel(table: 'leave' | 'correction', id: string) {
    const fn = table === 'leave' ? 'cancel_leave_request' : 'cancel_punch_correction';
    const args = table === 'leave' ? { p_request_id: id } : { p_correction_id: id };
    await supabase.rpc(fn, args);
    queryClient.invalidateQueries({ queryKey: [table === 'leave' ? 'my_leave' : 'my_corrections'] });
  }

  return (
    <Screen>
      <Title>{t('requests.title')}</Title>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'leave', label: t('requests.newLeave') },
          { value: 'correction', label: t('requests.newCorrection') },
        ]}
      />
      <Card>
        {mode === 'leave' ? (
          <>
            <Body muted>{t('requests.type')}</Body>
            <Row>
              {(types.data ?? []).map((lt) => (
                <Pressable key={lt.id} onPress={() => setTypeId(lt.id)} accessibilityRole="radio" accessibilityState={{ selected: lt.id === typeId }}>
                  <Badge label={lt.name} kind={lt.id === typeId ? 'ok' : 'muted'} />
                </Pressable>
              ))}
            </Row>
            <Field label={t('requests.from')} value={form.from} onChangeText={set('from')} placeholder="2026-12-28" />
            <Field label={t('requests.to')} value={form.to} onChangeText={set('to')} placeholder="2026-12-29" />
            <Field
              label={t('requests.quantity', { unit: t(type?.unit === 'hours' ? 'unit.hours' : 'unit.days') })}
              value={form.quantity}
              onChangeText={set('quantity')}
              keyboardType="decimal-pad"
            />
            {type?.requires_protocol ? <Field label={t('requests.protocol')} value={form.protocol} onChangeText={set('protocol')} /> : null}
            <Field label={t('requests.note')} value={form.note} onChangeText={set('note')} />
          </>
        ) : (
          <>
            <Segmented
              value={form.punchType}
              onChange={(v) => setForm((f) => ({ ...f, punchType: v }))}
              options={[
                { value: 'in', label: t('requests.in') },
                { value: 'out', label: t('requests.out') },
              ]}
            />
            <Field label={t('requests.when')} value={form.when} onChangeText={set('when')} placeholder="2026-10-07 08:30" />
            <Field label={t('requests.reason')} value={form.reason} onChangeText={set('reason')} />
          </>
        )}
        <Button label={t('requests.send')} icon="solicitudes" busy={busy} onPress={submit} />
        {message ? <Notice kind={message.kind === 'info' ? 'info' : 'danger'}>{message.text}</Notice> : null}
      </Card>

      <Card>
        {mode === 'leave'
          ? (leave.data ?? []).map((r) => (
              <View key={r.id} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Body>{r.leave_types?.name}</Body>
                  <Badge label={t(`status.${r.status}` as AppKey)} kind={statusKind[r.status]} />
                </Row>
                <Mono>
                  {date(r.start_date)}
                  {r.end_date !== r.start_date ? ` → ${date(r.end_date)}` : ''} · {Number(r.quantity)}{' '}
                  {t(r.leave_types?.unit === 'hours' ? 'unit.hours' : 'unit.days')}
                </Mono>
                {r.status === 'pending' ? <Button kind="danger" label={t('requests.cancel')} onPress={() => cancel('leave', r.id)} /> : null}
              </View>
            ))
          : (corrections.data ?? []).map((c) => (
              <View key={c.id} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Body>{t(c.punch_type === 'in' ? 'requests.in' : 'requests.out')} · {date(c.requested_ts)} {time(c.requested_ts)}</Body>
                  <Badge label={t(`status.${c.status}` as AppKey)} kind={statusKind[c.status]} />
                </Row>
                <Mono>{c.reason}</Mono>
                {c.status === 'pending' ? <Button kind="danger" label={t('requests.cancel')} onPress={() => cancel('correction', c.id)} /> : null}
              </View>
            ))}
        {(mode === 'leave' ? leave.data : corrections.data)?.length === 0 ? <Body muted>{t('requests.empty')}</Body> : null}
      </Card>
    </Screen>
  );
}
