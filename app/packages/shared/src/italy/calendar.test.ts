import { describe, expect, it } from 'vitest';
import { easterSunday, isItalianWorkingDay, italianHolidays, italianWorkingDays } from './calendar';

describe('Italian calendar', () => {
  it('computes Easter Sunday', () => {
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });

  it('lists the national holidays, with Easter Monday and 4 October from 2026', () => {
    expect(italianHolidays(2026)).toContain('2026-04-06');
    expect(italianHolidays(2026)).toContain('2026-10-04');
    expect(italianHolidays(2025)).not.toContain('2025-10-04');
    expect(italianHolidays(2026)).toHaveLength(12);
  });

  it('skips weekends and holidays', () => {
    expect(isItalianWorkingDay('2026-10-12')).toBe(true); // Monday
    expect(isItalianWorkingDay('2026-10-10')).toBe(false); // Saturday
    expect(isItalianWorkingDay('2026-12-08')).toBe(false); // Immacolata, Tuesday
  });

  it('counts working days in a range, both ends included', () => {
    expect(italianWorkingDays('2026-10-12', '2026-10-16')).toBe(5);
    expect(italianWorkingDays('2026-12-21', '2027-01-08')).toBe(12); // 25 Dec, 1 and 6 Jan off; 26 Dec is a Saturday
    expect(italianWorkingDays('2026-10-16', '2026-10-16')).toBe(1);
    expect(italianWorkingDays('2026-10-17', '2026-10-12')).toBe(0);
  });
});
