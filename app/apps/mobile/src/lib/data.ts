// Server data for the signed-in member (RLS limits every query to them).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
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

export function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
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
