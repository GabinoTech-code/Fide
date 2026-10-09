import { describe, expect, it } from 'vitest';
import { buildNotices, formatDuration, workday } from './dashboard';

const at = (hhmm: string) => `2026-10-09T${hhmm}:00.000Z`;

describe('workday', () => {
  it('is empty before the first punch', () => {
    expect(workday([], Date.parse(at('09:00')))).toEqual({ state: 'none', since: null, workedMs: 0 });
  });

  it('counts the open shift up to now', () => {
    const w = workday([{ type: 'in', ts: at('08:30') }], Date.parse(at('10:00')));
    expect(w).toEqual({ state: 'in', since: at('08:30'), workedMs: 90 * 60_000 });
  });

  it('adds closed pairs and ignores a stray exit or a repeated entry', () => {
    const w = workday(
      [
        { type: 'out', ts: at('07:00') },
        { type: 'in', ts: at('08:00') },
        { type: 'in', ts: at('08:05') },
        { type: 'out', ts: at('12:00') },
        { type: 'in', ts: at('13:00') },
        { type: 'out', ts: at('17:00') },
      ],
      Date.parse(at('18:00')),
    );
    expect(w.state).toBe('out');
    expect(w.workedMs).toBe(8 * 3_600_000);
  });

  it('formats as HH:MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(8 * 3_600_000 + 61_000)).toBe('08:01:01');
  });
});

describe('notices', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');

  it('lists unopened documents and recent decisions, newest first', () => {
    const notices = buildNotices(
      {
        documents: [
          { id: 'new', title: 'Cedolino settembre', status: 'published', published_at: '2026-10-08T10:00:00Z', first_opened_at: null },
          { id: 'read', title: 'Cedolino agosto', status: 'published', published_at: '2026-09-08T10:00:00Z', first_opened_at: '2026-09-09T10:00:00Z' },
          { id: 'old', title: 'Sostituito', status: 'superseded', published_at: '2026-10-01T10:00:00Z', first_opened_at: null },
        ],
        leave: [
          { id: 'ok', status: 'approved', decided_at: '2026-10-09T08:00:00Z', leave_types: { name: 'Ferie' } },
          { id: 'stale', status: 'approved', decided_at: '2026-09-01T08:00:00Z', leave_types: { name: 'Ferie' } },
          { id: 'wait', status: 'pending', decided_at: null, leave_types: { name: 'ROL' } },
        ],
        corrections: [{ id: 'no', status: 'rejected', decided_at: '2026-10-07T08:00:00Z', punch_type: 'out' }],
      },
      now,
    );
    expect(notices.map((n) => n.id)).toEqual(['ok', 'new', 'no']);
    expect(notices[0]).toMatchObject({ kind: 'leave', label: 'Ferie', status: 'approved' });
    expect(notices[2]).toMatchObject({ kind: 'correction', punchType: 'out', status: 'rejected' });
  });
});
