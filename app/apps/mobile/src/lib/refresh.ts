// Keeps server data fresh without restarting the app: React Query learns when
// the app is in the foreground, and each tab refetches its data when shown.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { focusManager } from '@tanstack/react-query';

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
