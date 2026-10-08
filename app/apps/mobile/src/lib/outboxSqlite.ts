// SQLite implementation of the punch outbox (see outbox.ts for the logic).
// Stores signed punches and receipts: timestamps, method and site, never GPS.
import * as SQLite from 'expo-sqlite';
import type { OutboxStore, QueuedPunch, Receipt } from './outbox';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= SQLite.openDatabaseAsync('fide.db').then(async (d) => {
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        rejected TEXT
      );
      CREATE TABLE IF NOT EXISTS receipts (
        client_punch_id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        device_ts TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS receipts_ts ON receipts (device_ts);
    `);
    return d;
  });
  return dbPromise;
}

export const sqliteOutbox: OutboxStore = {
  async pending() {
    const rows = await (await db()).getAllAsync<{ payload: string; created_at: number; attempts: number; rejected: string | null }>(
      'SELECT payload, created_at, attempts, rejected FROM outbox ORDER BY created_at',
    );
    return rows.map((r): QueuedPunch => ({ submission: JSON.parse(r.payload), createdAt: r.created_at, attempts: r.attempts, rejected: r.rejected }));
  },
  async put(item) {
    await (await db()).runAsync(
      'INSERT OR REPLACE INTO outbox (id, payload, created_at, attempts, rejected) VALUES (?, ?, ?, ?, ?)',
      item.submission.client_punch_id,
      JSON.stringify(item.submission),
      item.createdAt,
      item.attempts,
      item.rejected,
    );
  },
  async remove(id) {
    await (await db()).runAsync('DELETE FROM outbox WHERE id = ?', id);
  },
  async saveReceipt(receipt) {
    await (await db()).runAsync(
      'INSERT OR REPLACE INTO receipts (client_punch_id, payload, device_ts) VALUES (?, ?, ?)',
      receipt.client_punch_id,
      JSON.stringify(receipt),
      receipt.device_ts,
    );
  },
  async receipts(sinceIso) {
    const rows = await (await db()).getAllAsync<{ payload: string }>(
      'SELECT payload FROM receipts WHERE device_ts >= ? ORDER BY device_ts',
      sinceIso,
    );
    return rows.map((r) => JSON.parse(r.payload) as Receipt);
  },
};

/** Drops local punch history (sign-out, GDPR erasure). Queued punches are kept unless `all`. */
export async function clearLocalPunches(all: boolean): Promise<void> {
  const d = await db();
  await d.execAsync(all ? 'DELETE FROM receipts; DELETE FROM outbox;' : 'DELETE FROM receipts;');
}
