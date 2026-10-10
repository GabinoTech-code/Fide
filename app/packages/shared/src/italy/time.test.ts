import { describe, expect, it } from 'vitest';
import { romeDate, romeLocalToIso, romeNowLocal, romeOffsetMinutes, romeWallTimeToIso } from './time';

describe('Italian company time', () => {
  it('knows summer and winter time', () => {
    expect(romeOffsetMinutes(Date.parse('2026-10-09T12:00:00Z'))).toBe(120);
    expect(romeOffsetMinutes(Date.parse('2026-12-01T12:00:00Z'))).toBe(60);
  });

  it('turns an Italian wall time into UTC, whatever zone runs the code', () => {
    expect(romeWallTimeToIso('2026-10-09', 8, 30)).toBe('2026-10-09T06:30:00.000Z');
    expect(romeWallTimeToIso('2026-12-01', 8, 30)).toBe('2026-12-01T07:30:00.000Z');
    expect(romeWallTimeToIso('2026-10-10', 0, 0)).toBe('2026-10-09T22:00:00.000Z');
  });

  it('handles the days the clocks change', () => {
    // 29 March 2026: 02:00 → 03:00. 25 October 2026: 03:00 → 02:00.
    expect(romeWallTimeToIso('2026-03-29', 1, 30)).toBe('2026-03-29T00:30:00.000Z');
    expect(romeWallTimeToIso('2026-03-29', 3, 30)).toBe('2026-03-29T01:30:00.000Z');
    expect(romeWallTimeToIso('2026-10-25', 8, 0)).toBe('2026-10-25T07:00:00.000Z');
  });

  it('gives the Italian day of an instant', () => {
    expect(romeDate('2026-10-09T22:30:00Z')).toBe('2026-10-10');
    expect(romeDate('2026-10-09T21:30:00Z')).toBe('2026-10-09');
  });

  it('reads and writes datetime-local values in Italian time', () => {
    expect(romeNowLocal(new Date('2026-10-09T22:30:00Z'))).toBe('2026-10-10T00:30');
    expect(romeLocalToIso('2026-10-09T08:30')).toBe('2026-10-09T06:30:00.000Z');
  });
});
