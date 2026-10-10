import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, inTx, seed, type Session } from './harness';
import { deliverPush, dispatchPush, pushMessage, PUSH_TEXTS, type PushDelivery } from '../../../../supabase/functions/_shared/push';

let db: PGlite;
beforeAll(async () => { db = await createDb(); }, 60_000);
afterAll(async () => db?.close());
const token = 'ExpoPushToken[marco-test]';
async function register(s: Session) {
  await s.as(seed.users.marco);
  await s.rows('select register_push_token($1,$2,$3)', [seed.keys.marco, token, 'android']);
}
async function enqueue(s: Session) {
  await s.superuser();
  await s.rows(`insert into private.notification_outbox(company_id,recipient_member_id,kind,ref_id)
    values($1,$2,'document_published',gen_random_uuid())`, [seed.aurora, seed.members.marco]);
}
async function claim(s: Session) {
  await s.service();
  return s.value<PushDelivery[]>('select svc_push_claim()');
}

describe('push ownership and live dependencies', () => {
  it('registers only the authenticated member active key, refreshes idempotently and isolates companies', async () => {
    await inTx(db, async (s) => {
      await register(s); await register(s);
      expect(await s.value<number>('select count(*)::int from push_tokens')).toBe(1);
      await s.as(seed.users.sara);
      expect(await s.rows('select * from push_tokens')).toEqual([]);
      expect((await s.error('select register_push_token($1,$2,$3)', [seed.keys.marco, token, 'ios'])).code).toBe('42501');
      expect((await s.error('select register_push_token($1,$2,$3)', [seed.keys.sara, token, 'ios'])).code).toBe('42501');
      await s.rows('select unregister_push_token($1)', [seed.keys.marco]);
      await s.as(seed.users.marco);
      expect(await s.value<number>('select count(*)::int from push_tokens')).toBe(1);
      expect((await s.error('insert into push_tokens(expo_push_token,platform,device_key_id) values($1,$2,$3)', [token, 'ios', seed.keys.marco])).code).toBe('42501');
    });
  });
  it('rejects anonymous registration and keeps service dispatch private', async () => {
    await inTx(db, async (s) => {
      await s.anon();
      expect((await s.error('select register_push_token($1,$2,$3)', [seed.keys.marco, token, 'ios'])).code).toBe('42501');
      await s.as(seed.users.marco);
      expect((await s.error('select svc_push_claim()')).code).toBe('42501');
      expect((await s.error('select * from private.push_outbox')).code).toBe('42501');
    });
  });
  it('queues only the intended recipient and returns no document, company, email or name', async () => {
    await inTx(db, async (s) => {
      await s.as(seed.users.sara);
      await s.rows('select register_push_token($1,$2,$3)', [seed.keys.sara, 'ExpoPushToken[sara-test]', 'ios']);
      await register(s); await enqueue(s);
      const rows = await claim(s);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ id: expect.any(Number), token, language: 'it', ticket: null });
      expect(await claim(s)).toEqual([]); // exclusive claim lease
    });
  });
  for (const state of ['revoked', 'suspended', 'terminated'] as const) {
    it(`removes token and queued push when dependency becomes ${state}`, async () => {
      await inTx(db, async (s) => {
        await register(s); await enqueue(s); await s.superuser();
        if (state === 'revoked') await s.rows(`update device_keys set status='revoked',revoked_at=now() where id=$1`, [seed.keys.marco]);
        else await s.rows(`update members set status=$2::public.member_status,terminated_on=case when $2::text='terminated' then current_date else null end where id=$1`, [seed.members.marco, state]);
        expect(await claim(s)).toEqual([]);
        await s.as(seed.users.marco);
        expect((await s.error('select register_push_token($1,$2,$3)', [seed.keys.marco, token, 'ios'])).code).toBe('42501');
        expect(await s.rows('select * from push_tokens')).toEqual([]);
      });
    });
  }
  it('sign-out removal erases pending sends; expired tokens are purged', async () => {
    await inTx(db, async (s) => {
      await register(s); await enqueue(s);
      await s.as(seed.users.marco); await s.rows('select unregister_push_token($1)', [seed.keys.marco]);
      expect(await claim(s)).toEqual([]);
      await register(s); await enqueue(s); await s.superuser();
      await s.rows(`update push_tokens set last_seen_at=now()-interval '31 days'`);
      expect(await claim(s)).toEqual([]);
      await s.superuser(); expect(await s.rows('select * from push_tokens')).toEqual([]);
    });
  });
  it('rechecks the live key even if an old token survived cleanup', async () => {
    await inTx(db, async (s) => {
      await register(s); await enqueue(s); await s.superuser();
      await s.rows('alter table device_keys disable trigger device_push_revoked');
      await s.rows(`update device_keys set status='revoked',revoked_at=now() where id=$1`, [seed.keys.marco]);
      await s.rows('alter table device_keys enable trigger device_push_revoked');
      expect(await claim(s)).toEqual([]);
      await s.superuser();
      expect(await s.value<string>('select last_error from private.push_outbox')).toBe('no_recipient');
    });
  });
  it('stores tickets separately from email and waits 15 minutes for receipts; invalid devices are deleted', async () => {
    await inTx(db, async (s) => {
      await register(s); await enqueue(s);
      const [n] = await claim(s);
      await s.rows('select svc_push_done($1,$2)', [n.id, 'ticket-1']);
      expect(await claim(s)).toEqual([]);
      await s.superuser();
      await s.rows(`update private.push_outbox set accepted_at=now()-interval '16 minutes'`);
      expect((await claim(s))[0].ticket).toBe('ticket-1');
      await s.rows('select svc_push_done($1,null,$2,false)', [n.id, 'DeviceNotRegistered']);
      await s.superuser(); expect(await s.rows('select * from push_tokens')).toEqual([]);
      expect(await s.value<number>('select count(*)::int from private.notification_outbox')).toBe(1);
    });
  });
  it('retries at most five times and expires receipts at 24 hours', async () => {
    await inTx(db, async (s) => {
      await register(s); await enqueue(s);
      for (let attempt = 0; attempt < 5; attempt++) {
        const [n] = await claim(s);
        expect(n).toBeDefined();
        await s.rows('select svc_push_done($1,null,$2,false)', [n.id, 'expo_unavailable']);
      }
      expect(await claim(s)).toEqual([]);
      await enqueue(s);
      const [n] = await claim(s); await s.rows('select svc_push_done($1,$2)', [n.id, 'old-ticket']);
      await s.superuser(); await s.rows(`update private.push_outbox set accepted_at=now()-interval '25 hours' where id=$1`, [n.id]);
      expect(await claim(s)).toEqual([]);
      await s.superuser();
      expect(await s.value<string>('select last_error from private.push_outbox where id=$1', [n.id])).toBe('receipt_expired');
    });
  });
});

describe('Expo transport', () => {
  const n: PushDelivery = { id: 1, token, language: 'es', ticket: null };
  it('uses generic text in all nine languages, without event identifiers or sensitive data', () => {
    expect(Object.keys(PUSH_TEXTS)).toHaveLength(9);
    for (const language of Object.keys(PUSH_TEXTS)) {
      expect(pushMessage({ token, language })).toEqual({ to: token, title: 'Fide', body: PUSH_TEXTS[language], channelId: 'default', ttl: 300, priority: 'normal' });
    }
    expect(pushMessage({ token, language: 'unknown' }).body).toBe(PUSH_TEXTS.it);
  });
  it('fails closed without credentials, validates responses and strips messages containing tokens', async () => {
    let calls = 0;
    const request: typeof fetch = async () => { calls++; return Response.json({ data: { status: 'ok', id: 't1' } }); };
    expect(await deliverPush(n, '', request)).toEqual({ error: 'push_credentials_missing' });
    expect(calls).toBe(0);
    expect(await deliverPush(n, 'access', request)).toEqual({ ticket: 't1' });
    expect(await deliverPush(n, 'access', async () => Response.json({ data: { status: 'error', message: token, details: { error: 'DeviceNotRegistered' } } }))).toEqual({ error: 'DeviceNotRegistered', finished: false });
    expect(await deliverPush(n, 'access', async () => Response.json({ data: { status: 'ok' } }))).toEqual({ error: 'invalid_expo_response' });
    expect(await deliverPush(n, 'access', async () => { throw new Error(token); })).toEqual({ error: 'expo_unavailable' });
  });
  it('polls receipts without sending a duplicate message and preserves pending tickets', async () => {
    const request: typeof fetch = async (url, options) => {
      expect(url).toBe('https://exp.host/--/api/v2/push/getReceipts');
      expect(JSON.parse(String(options?.body))).toEqual({ ids: ['t1'] });
      return Response.json({ data: { t1: { status: 'ok' } } });
    };
    expect(await deliverPush({ ...n, ticket: 't1' }, 'access', request)).toEqual({ finished: true });
    expect(await deliverPush({ ...n, ticket: 't1' }, 'access', async () => Response.json({ data: {} }))).toEqual({ error: 'receipt_pending' });
  });
  it('persists each channel outcome without raw provider errors', async () => {
    const done: Array<[number, unknown]> = [];
    expect(await dispatchPush({ claim: async () => [n], send: async () => ({ ticket: 't1' }), done: async (id, result) => { done.push([id, result]); } })).toEqual({ accepted: 1, failed: 0 });
    expect(done).toEqual([[1, { ticket: 't1' }]]);
  });
});
