import type { MessageKey } from './i18n';

// Codes raised by the SQL functions (`raise exception '<code>'`) and Edge Functions.
const KNOWN: Record<string, MessageKey> = {
  signup_not_allowed: 'error.signupNotAllowed',
  email_not_confirmed: 'error.emailNotConfirmed',
  forbidden: 'error.forbidden',
  not_authenticated: 'error.notAuthenticated',
  member_not_invitable: 'error.memberNotInvitable',
  member_email_missing: 'error.memberEmailMissing',
  last_owner: 'error.lastOwner',
  device_key_not_active: 'error.deviceKeyNotActive',
  upload_incomplete: 'error.uploadIncomplete',
  supersedes_invalid: 'error.supersedesInvalid',
  not_draft: 'error.notDraft',
  pdf_password: 'payroll.encryptedPdf',
  pdf_invalid: 'payroll.notPdf',
  crypto_selftest_failed: 'payroll.cryptoBroken',
  pairing_code_invalid: 'error.pairingCodeInvalid',
  not_pending: 'error.notPending',
  termination_date_required: 'error.terminationDateRequired',
  termination_date_invalid: 'error.terminationDateInvalid',
  email_locked: 'error.emailLocked',
  manager_invalid: 'error.managerInvalid',
  member_erased: 'error.memberErased',
  self_entry: 'error.selfEntry',
  member_not_active: 'error.memberNotActive',
  reason_required: 'error.reasonRequired',
  ts_in_future: 'error.tsInFuture',
  protocol_required: 'error.protocolRequired',
  leave_type_inactive: 'error.leaveTypeInactive',
  already_withdrawn: 'error.alreadyWithdrawn',
  answer_required: 'error.answerRequired',
  already_resolved: 'error.alreadyResolved',
  already_extended: 'error.alreadyExtended',
  deadline_passed: 'error.deadlinePassed',
  member_not_terminated: 'error.memberNotTerminated',
};

export function errorKey(err: unknown): MessageKey {
  const message = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  for (const [needle, key] of Object.entries(KNOWN)) if (message.includes(needle)) return key;
  if (code === '23505') return 'error.duplicate';
  if (code === '23514') return 'error.invalidValue';
  return 'error.generic';
}
