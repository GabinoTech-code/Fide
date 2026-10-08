// Member lifecycle rules (former employees keep 12 months of read access).
// They live in @fide/shared so the portal and the app agree with each other
// and with private.has_own_access() in the database.
export { FORMER_ACCESS_MONTHS, formerAccessUntil as accessUntil, hasDocumentAccess, todayInRome } from '@fide/shared';
