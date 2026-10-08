// Member lifecycle rules shared by the portal and the app. They mirror
// private.has_own_access() in supabase/migrations/20261009090100_member_lifecycle.sql:
// a terminated member keeps read access to their own documents while
// terminated_on > today − 12 months, so HR can still send the final payslip,
// the TFR and next year's CU.

export const FORMER_ACCESS_MONTHS = 12;

/** Today's date in Italy as YYYY-MM-DD. */
export function todayInRome(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(now);
}

/** Last day (YYYY-MM-DD) a former employee can still open their documents. */
export function formerAccessUntil(terminatedOn: string): string {
  const [y, m, d] = terminatedOn.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + FORMER_ACCESS_MONTHS, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** True when the member can still receive and open documents in the app. */
export function hasDocumentAccess(m: { status: string; terminated_on: string | null }, today = todayInRome()): boolean {
  if (m.status === 'active') return true;
  return m.status === 'terminated' && m.terminated_on !== null && formerAccessUntil(m.terminated_on) >= today;
}
