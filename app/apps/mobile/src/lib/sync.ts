import { flush, type FlushSummary, type SyncResult } from './outbox';
import { sqliteOutbox } from './outboxSqlite';
import { callFunction } from './supabase';

let running: Promise<FlushSummary> | null = null;

/** Sends queued punches through punch-sync. Concurrent calls share one run. */
export function syncOutbox(): Promise<FlushSummary> {
  running ??= flush(sqliteOutbox, async (punches) => {
    const { results } = await callFunction<{ results: SyncResult[] }>('punch-sync', { punches });
    return results;
  }).finally(() => {
    running = null;
  });
  return running;
}
