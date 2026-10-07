// Offline-first punch queue. Signed punches are stored first and sent when the
// network allows; the server receipt replaces the queued entry. Storage is
// injected (SQLite on the phone, memory in tests).
import type { PunchSubmission } from './punch';

export interface QueuedPunch {
  submission: PunchSubmission;
  createdAt: number;
  attempts: number;
  /** Set when the server refused the punch for good: it is kept but never retried. */
  rejected: string | null;
}

export interface Receipt {
  client_punch_id: string;
  id: string;
  receipt_code: string;
  received_at: string;
  flags: string[];
  punch_type: 'in' | 'out';
  method: 'geo' | 'qr';
  device_ts: string;
}

export interface OutboxStore {
  pending(): Promise<QueuedPunch[]>;
  put(item: QueuedPunch): Promise<void>;
  remove(clientPunchId: string): Promise<void>;
  saveReceipt(receipt: Receipt): Promise<void>;
  receipts(sinceIso: string): Promise<Receipt[]>;
}

export type SyncResult =
  | { client_punch_id: string; ok: true; id: string; receipt_code: string; received_at: string; flags: string[] }
  | { client_punch_id: string | null; ok: false; error: string };

export type SendBatch = (punches: PunchSubmission[]) => Promise<SyncResult[]>;

const BATCH = 50;

export async function enqueue(store: OutboxStore, submission: PunchSubmission, now = Date.now()): Promise<void> {
  await store.put({ submission, createdAt: now, attempts: 0, rejected: null });
}

export interface FlushSummary {
  sent: number;
  rejected: Array<{ client_punch_id: string; error: string }>;
  /** True when the network or server failed: items stay queued for later. */
  deferred: boolean;
}

/**
 * Sends queued punches oldest first. A transport error keeps everything queued;
 * per-punch refusals (bad signature, expired QR…) are marked and not retried.
 */
export async function flush(store: OutboxStore, send: SendBatch): Promise<FlushSummary> {
  const queue = (await store.pending())
    .filter((q) => q.rejected === null)
    .sort((a, b) => a.createdAt - b.createdAt);
  const summary: FlushSummary = { sent: 0, rejected: [], deferred: false };

  for (let i = 0; i < queue.length; i += BATCH) {
    const chunk = queue.slice(i, i + BATCH);
    let results: SyncResult[];
    try {
      results = await send(chunk.map((q) => q.submission));
    } catch {
      for (const q of chunk) await store.put({ ...q, attempts: q.attempts + 1 });
      summary.deferred = true;
      return summary;
    }
    const byId = new Map(chunk.map((q) => [q.submission.client_punch_id, q]));
    for (const r of results) {
      const item = r.client_punch_id ? byId.get(r.client_punch_id) : undefined;
      if (!item) continue;
      if (r.ok) {
        await store.saveReceipt({
          client_punch_id: item.submission.client_punch_id,
          id: r.id,
          receipt_code: r.receipt_code,
          received_at: r.received_at,
          flags: r.flags,
          punch_type: item.submission.punch_type,
          method: item.submission.method,
          device_ts: item.submission.device_ts,
        });
        await store.remove(item.submission.client_punch_id);
        summary.sent++;
      } else {
        await store.put({ ...item, attempts: item.attempts + 1, rejected: r.error });
        summary.rejected.push({ client_punch_id: item.submission.client_punch_id, error: r.error });
      }
    }
  }
  return summary;
}

/** Latest punch type of the day, from receipts and punches still queued. */
export function lastPunchType(receipts: Receipt[], queue: QueuedPunch[]): 'in' | 'out' | null {
  const all = [
    ...receipts.map((r) => ({ ts: r.device_ts, type: r.punch_type })),
    ...queue.filter((q) => !q.rejected).map((q) => ({ ts: q.submission.device_ts, type: q.submission.punch_type })),
  ].sort((a, b) => a.ts.localeCompare(b.ts));
  return all.length ? all[all.length - 1].type : null;
}

export class MemoryOutboxStore implements OutboxStore {
  private items = new Map<string, QueuedPunch>();
  private receiptList: Receipt[] = [];

  async pending() {
    return [...this.items.values()];
  }
  async put(item: QueuedPunch) {
    this.items.set(item.submission.client_punch_id, item);
  }
  async remove(id: string) {
    this.items.delete(id);
  }
  async saveReceipt(receipt: Receipt) {
    this.receiptList = this.receiptList.filter((x) => x.client_punch_id !== receipt.client_punch_id).concat(receipt);
  }
  async receipts(sinceIso: string) {
    return this.receiptList.filter((r) => r.device_ts >= sinceIso);
  }
}
