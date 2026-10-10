// Server data for the signed-in member (RLS limits every query to them).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { romeDate, romeWallTimeToIso } from '@fide/shared';
import { listDocuments } from './documents';
import type { QueuedPunch } from './outbox';
import { sqliteOutbox } from './outboxSqlite';
import { useSession } from './session';
import { supabase } from './supabase';
import { syncOutbox } from './sync';

export interface Site {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radius_m: number;
  geo_enabled: boolean;
}

export interface ServerPunch {
  id: string;
  punch_type: 'in' | 'out';
  method: 'geo' | 'qr' | 'manual';
  device_ts: string;
  receipt_code: string;
  flags: string[];
}

/** Midnight in Italy today, as a UTC instant. */
export function startOfToday(): string {
  return romeWallTimeToIso(romeDate(new Date()), 0, 0);
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useSites() {
  const { membership } = useSession();
  return useQuery({
    queryKey: ['sites', membership?.company_id],
    enabled: Boolean(membership),
    queryFn: () =>
      rows<Site>(
        supabase.from('sites').select('id, name, latitude, longitude, radius_m, geo_enabled').eq('company_id', membership!.company_id).order('name'),
      ),
  });
}

export function useTodayPunches() {
  const { membership } = useSession();
  return useQuery({
    queryKey: ['punches', membership?.id, startOfToday()],
    enabled: Boolean(membership),
    queryFn: () =>
      rows<ServerPunch>(
        supabase
          .from('punches')
          .select('id, punch_type, method, device_ts, receipt_code, flags')
          .eq('member_id', membership!.id)
          .gte('device_ts', startOfToday())
          .order('device_ts'),
      ),
  });
}

/** Local outbox, re-read on demand and synced whenever the app comes to the foreground. */
export function useOutbox() {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<QueuedPunch[]>([]);

  const reload = useCallback(async () => {
    setQueue(await sqliteOutbox.pending());
  }, []);

  const sync = useCallback(async () => {
    try {
      const summary = await syncOutbox();
      if (summary.sent) await queryClient.invalidateQueries({ queryKey: ['punches'] });
      return summary;
    } finally {
      await reload();
    }
  }, [queryClient, reload]);

  useEffect(() => {
    sqliteOutbox.pending().then(setQueue, () => undefined);
    sync().catch(() => undefined);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync().catch(() => undefined);
    });
    return () => sub.remove();
  }, [sync]);

  return { queue, reload, sync };
}

export interface Balance {
  leave_type_id: string;
  code: string;
  unit: 'days' | 'hours';
  remaining: number;
}

export function useBalances() {
  const { membership } = useSession();
  const year = new Date().getFullYear();
  return useQuery({
    queryKey: ['balances', membership?.id, year],
    enabled: Boolean(membership),
    queryFn: () =>
      rows<Balance>(
        supabase.from('leave_balance_summary').select('leave_type_id, code, unit, remaining').eq('member_id', membership!.id).eq('year', year),
      ),
  });
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  unit: 'days' | 'hours';
  requires_protocol: boolean;
}

export interface MyLeave {
  id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  quantity: number;
  status: RequestStatus;
  /** Set when HR recorded it on the employee's behalf. */
  entered_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  leave_types: { name: string; unit: 'days' | 'hours' } | null;
}

export interface MyCorrection {
  id: string;
  punch_type: 'in' | 'out';
  requested_ts: string;
  reason: string;
  status: RequestStatus;
  entered_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

// While something waits for HR, look for the decision every minute (only while the app is in front).
const whilePending = (rows: { status: string }[] | undefined) => (rows?.some((r) => r.status === 'pending') ? 60_000 : false);

export function useLeaveTypes() {
  const { membership } = useSession();
  return useQuery({
    queryKey: ['leave_types', membership?.company_id],
    enabled: Boolean(membership),
    queryFn: () =>
      rows<LeaveType>(supabase.from('leave_types').select('id, code, name, unit, requires_protocol').eq('active', true).order('name')),
  });
}

export function useMyLeave() {
  const { membership } = useSession();
  return useQuery({
    queryKey: ['my_leave', membership?.id],
    enabled: Boolean(membership),
    queryFn: () =>
      rows<MyLeave>(
        supabase
          .from('leave_requests')
          .select('id, leave_type_id, start_date, end_date, quantity, status, entered_by, decided_at, decision_note, leave_types(name, unit)')
          .eq('member_id', membership!.id)
          .order('start_date', { ascending: false })
          .limit(30),
      ),
    refetchInterval: (q) => whilePending(q.state.data),
  });
}

export function useMyCorrections() {
  const { membership } = useSession();
  return useQuery({
    queryKey: ['my_corrections', membership?.id],
    enabled: Boolean(membership),
    queryFn: () =>
      rows<MyCorrection>(
        supabase
          .from('punch_corrections')
          .select('id, punch_type, requested_ts, reason, status, entered_by, decided_at, decision_note')
          .eq('member_id', membership!.id)
          .order('requested_ts', { ascending: false })
          .limit(30),
      ),
    refetchInterval: (q) => whilePending(q.state.data),
  });
}

export function useDocuments() {
  const { membership } = useSession();
  return useQuery({ queryKey: ['documents', membership?.id], enabled: Boolean(membership), queryFn: listDocuments });
}

export interface AccessEvent {
  id: number;
  document_id: string;
  actor_member_id: string | null;
  event: 'published' | 'downloaded' | 'opened' | 'superseded' | 'deleted';
  created_at: string;
}

/** Who touched the member's documents and when (RLS: own rows only). */
export function useAccessEvents() {
  const { membership } = useSession();
  return useQuery({
    queryKey: ['access_events', membership?.id],
    enabled: Boolean(membership),
    queryFn: () =>
      rows<AccessEvent>(
        supabase
          .from('document_access_events')
          .select('id, document_id, actor_member_id, event, created_at')
          .eq('member_id', membership!.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ),
  });
}
