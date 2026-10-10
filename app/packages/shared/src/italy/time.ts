// Company time is Italian time (Europe/Rome), whatever the phone's time zone:
// "08:30" in a forgotten-punch request means 08:30 in Italy, and the app shows
// the same clock as the HR portal. A phone left on another zone (a worker back
// from abroad, a wrong setting) would otherwise send and show shifted times.

export const COMPANY_TIME_ZONE = 'Europe/Rome';

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: COMPANY_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Minutes Europe/Rome is ahead of UTC at the given instant (60 or 120). */
export function romeOffsetMinutes(ms: number): number {
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** '2026-10-09' at 08:30 Italian time, as a UTC ISO instant. */
export function romeWallTimeToIso(date: string, hour: number, minute: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const asIfUtc = Date.UTC(y!, m! - 1, d!, hour, minute);
  // Two passes: the offset can change between the guess and the answer (DST days).
  let t = asIfUtc - romeOffsetMinutes(asIfUtc) * 60_000;
  t = asIfUtc - romeOffsetMinutes(t) * 60_000;
  return new Date(t).toISOString();
}

/** The Italian calendar day ('YYYY-MM-DD') of an instant. */
export function romeDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COMPANY_TIME_ZONE }).format(new Date(iso));
}

/** Now in Italy as 'YYYY-MM-DDTHH:mm', the format of a datetime-local input. */
export function romeNowLocal(now = new Date()): string {
  const p = Object.fromEntries(parts.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** 'YYYY-MM-DDTHH:mm' read as Italian time (a datetime-local value), as a UTC ISO instant. */
export function romeLocalToIso(local: string): string {
  const [date, hm] = local.split('T');
  const [h, m] = (hm ?? '00:00').split(':').map(Number);
  return romeWallTimeToIso(date!, h!, m!);
}
