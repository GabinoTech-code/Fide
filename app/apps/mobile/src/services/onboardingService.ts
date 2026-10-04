import { UserProfile } from '../types';

export interface InvitationData {
  invitationCode: string;
  company: string;
  employeeName: string;
  department: string;
  shiftSchedule: string;
  vacationQuota: number;
  permitQuota: number;
  enrollmentKey: string;
}

export const OnboardingService = {
  // Parse an invitation link or QR code payload
  parseInvitation(rawPayload: string): InvitationData {
    try {
      if (rawPayload.startsWith('fide://') || rawPayload.startsWith('http')) {
        const url = new URL(rawPayload);
        const params = url.searchParams;
        return {
          invitationCode: params.get('code') || 'INV-2026-FIDE',
          company: params.get('company') || 'Officine Aurora S.r.l.',
          employeeName: params.get('name') || 'Nuovo Collaboratore',
          department: params.get('dept') || 'Operazioni',
          shiftSchedule: params.get('shift') || '08:30 - 17:30',
          vacationQuota: parseFloat(params.get('vac') || '22'),
          permitQuota: parseFloat(params.get('per') || '32'),
          enrollmentKey: params.get('key') || 'fide_pk_enroll_7f3a91c2',
        };
      }
    } catch {
      // Fallback if plain text code or JSON
    }

    // Default invitation mock data
    return {
      invitationCode: 'INV-2026-9842',
      company: 'Officine Aurora S.r.l.',
      employeeName: 'Collaboratore Verificato',
      department: 'Logistica & Operazioni',
      shiftSchedule: '08:30 - 17:30',
      vacationQuota: 22,
      permitQuota: 32,
      enrollmentKey: 'fide_fido2_reg_token_88ab',
    };
  },

  // Generates FIDO2 WebAuthn credential locally without passwords
  async createPasskeyCredential(invitation: InvitationData): Promise<{
    credentialId: string;
    publicKeyFingerprint: string;
    userProfile: UserProfile;
  }> {
    // Simulating WebAuthn navigator.credentials.create() with platform authenticator (FaceID / TouchID / Windows Hello)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const credentialId = `fido2_cred_${Date.now()}`;
    const publicKeyFingerprint = '4B8F 91E2 7A30 D915 88CE 3F11';

    const userProfile: UserProfile = {
      id: `usr_${Date.now().toString(36)}`,
      name: invitation.employeeName,
      company: invitation.company,
      department: invitation.department,
      vacationQuotaDays: invitation.vacationQuota,
      vacationUsedDays: 0,
      permitQuotaHours: invitation.permitQuota,
      permitUsedHours: 0,
      shiftSchedule: invitation.shiftSchedule,
    };

    return {
      credentialId,
      publicKeyFingerprint,
      userProfile,
    };
  },
};
