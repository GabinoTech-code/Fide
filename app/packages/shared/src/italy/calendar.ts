// Italian working-day calendar for leave requests: Monday to Friday minus the
// national holidays (L. 260/1949 and later laws). Local patron-saint days vary
// by comune and are not included. Dates are plain 'YYYY-MM-DD' strings, handled
// in UTC so the device time zone never shifts a day.

const DAY_MS = 86_400_000;

function parse(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Easter Sunday (Gregorian, anonymous algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return format(Date.UTC(year, month - 1, day));
}

/** National public holidays of the given year, sorted. */
export function italianHolidays(year: number): string[] {
  const fixed = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];
  // San Francesco d'Assisi, national holiday again from 2026 (L. 151/2025).
  if (year >= 2026) fixed.push('10-04');
  const easterMonday = format(parse(easterSunday(year)) + DAY_MS);
  return [...fixed.map((md) => `${year}-${md}`), easterMonday].sort();
}

export function isItalianWorkingDay(iso: string): boolean {
  const weekday = new Date(parse(iso)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !italianHolidays(Number(iso.slice(0, 4))).includes(iso);
}

/** Working days from `from` to `to`, both included; 0 when the range is reversed. */
export function italianWorkingDays(from: string, to: string): number {
  let count = 0;
  for (let t = parse(from); t <= parse(to); t += DAY_MS) {
    if (isItalianWorkingDay(format(t))) count++;
  }
  return count;
}
