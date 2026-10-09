// Keeps server data fresh without restarting the app: React Query learns when
// the app is in the foreground, each tab refetches its data when shown, and
// Realtime pushes the member's own changes (a decision by HR, a new payslip).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { focusManager, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

/** Call once at the root: stale queries refetch whenever the app comes back to the foreground. */
export function wireAppFocus(): () => void {
  const onChange = (status: AppStateStatus) => focusManager.setFocused(status === 'active');
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}

interface Refetchable {
  refetch: () => Promise<unknown>;
}

/**
 * Refetches the given queries each time the screen gains focus again (the
 * first focus is the initial load) and returns a pull-to-refresh handler.
 */
export function useLiveQueries(...queries: Refetchable[]) {
  const latest = useRef(queries);
  useEffect(() => {
    latest.current = queries;
  });
  const first = useRef(true);
  const [refreshing, setRefreshing] = useState(false);

  const refetchAll = useCallback(() => Promise.all(latest.current.map((q) => q.refetch())), []);

  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refetchAll().catch(() => undefined);
    }, [refetchAll]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchAll();
    } catch {
      // The screen shows its own error state; the spinner must still stop.
    } finally {
      setRefreshing(false);
    }
  }, [refetchAll]);

  return { refreshing, onRefresh };
}

/** Tables in the supabase_realtime publication and the queries each one feeds. */
const LIVE_TABLES: Record<string, string[]> = {
  leave_requests: ['my_leave', 'balances'],
  punch_corrections: ['my_corrections'],
  documents: ['documents'],
  punches: ['punches'],
};

/**
 * Subscribes to changes on the member's own rows. Realtime applies RLS per
 * subscriber, so the filter narrows the stream and the policies still decide.
 */
export function useRealtimeRefresh(memberId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!memberId) return;
    const channel = supabase.channel(`member:${memberId}`);
    for (const [table, keys] of Object.entries(LIVE_TABLES)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `member_id=eq.${memberId}` }, () => {
        for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
      });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [memberId, queryClient]);
}

/** Current time, ticking every second only while `running` (an open shift). */
export function useClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now;
}
