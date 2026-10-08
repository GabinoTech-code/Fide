import { describe, expect, it } from 'vitest';
import type { GdprRequest } from '../lib/types';
import { isOverdue, sortRequests } from './PrivacyPage';

const req = (id: string, over: Partial<GdprRequest>): GdprRequest => ({
  id,
  member_id: 'm',
  kind: 'erasure',
  details: null,
  status: 'pending',
  created_at: '2026-10-01T08:00:00Z',
  due_at: '2026-11-01T08:00:00Z',
  extended_at: null,
  extension_note: null,
  resolution_note: null,
  resolved_at: null,
  ...over,
});

describe('GDPR inbox', () => {
  it('lists open requests by deadline, then closed ones newest first', () => {
    const list = [
      req('closed-old', { status: 'completed', resolved_at: '2026-09-01T00:00:00Z' }),
      req('late', { due_at: '2026-12-01T00:00:00Z', status: 'in_progress' }),
      req('closed-new', { status: 'rejected', resolved_at: '2026-10-05T00:00:00Z' }),
      req('soon', { due_at: '2026-10-20T00:00:00Z' }),
    ];
    expect(sortRequests(list).map((r) => r.id)).toEqual(['soon', 'late', 'closed-new', 'closed-old']);
  });

  it('is overdue only while open and past the deadline', () => {
    const now = Date.parse('2026-11-02T00:00:00Z');
    expect(isOverdue(req('a', {}), now)).toBe(true);
    expect(isOverdue(req('b', { status: 'completed' }), now)).toBe(false);
    expect(isOverdue(req('c', { due_at: '2027-01-01T00:00:00Z' }), now)).toBe(false);
  });
});
