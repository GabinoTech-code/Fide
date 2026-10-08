import { describe, expect, it } from 'vitest';
import { formerAccessUntil as accessUntil, hasDocumentAccess, todayInRome } from './lifecycle';

describe('former employee access window', () => {
  it('ends the day before the first anniversary, like the SQL rule', () => {
    expect(accessUntil('2026-10-08')).toBe('2027-10-07');
    expect(accessUntil('2026-03-31')).toBe('2027-03-30');
    expect(accessUntil('2028-02-29')).toBe('2029-02-28');
  });

  it('active members always, terminated ones within the window, others never', () => {
    expect(hasDocumentAccess({ status: 'active', terminated_on: null }, '2030-01-01')).toBe(true);
    expect(hasDocumentAccess({ status: 'terminated', terminated_on: '2026-10-08' }, '2027-10-07')).toBe(true);
    expect(hasDocumentAccess({ status: 'terminated', terminated_on: '2026-10-08' }, '2027-10-08')).toBe(false);
    expect(hasDocumentAccess({ status: 'suspended', terminated_on: null }, '2026-10-08')).toBe(false);
    expect(hasDocumentAccess({ status: 'invited', terminated_on: null }, '2026-10-08')).toBe(false);
  });

  it('uses the Italian calendar day', () => {
    expect(todayInRome(new Date('2026-10-08T22:30:00Z'))).toBe('2026-10-09');
  });
});
