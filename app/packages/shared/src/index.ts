export * from './italy';
export * from './protocol';
export * from './brand';
export * from './security-headers';
export * from './lifecycle';

// B2B Company & Organization Types
export type SupportedCountry = 'IT' | 'ES';

export interface CompanyTaxData {
  country: SupportedCountry;
  legalName: string;
  taxId: string; // Partita IVA (IT) or CIF/NIF (ES)
  fiscalCode?: string; // Codice Fiscale (IT)
  pecEmail?: string; // Posta Elettronica Certificata (IT)
  sdiCode?: string; // Codice Destinatario Fatturazione Elettronica (IT)
  socialSecurityCode?: string; // CCC Seguridad Social (ES)
  collectiveAgreement: string; // CCNL applicabile (es. Metalmeccanico, Commercio)
  headquartersAddress: string;
}

export interface CompanySite {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  hasKioskQr: boolean;
  kioskSecretKey: string;
}

export interface EmployeeInvitation {
  id: string;
  code: string;
  companyId: string;
  companyName: string;
  employeeName: string;
  employeeEmailOrPhone: string;
  department: string;
  shiftSchedule: string;
  siteId: string;
  vacationQuotaDays: number;
  permitQuotaHours: number;
  inviteLink: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: number;
  expiresAt: number;
}

export interface E2EEPayrollBatch {
  id: string;
  month: string;
  year: number;
  totalDocuments: number;
  processedDocuments: number;
  status: 'draft' | 'encrypting' | 'published';
  createdAt: number;
}

export interface CompanyRegistrationState {
  step: 1 | 2 | 3 | 4;
  taxData: CompanyTaxData;
  adminPasskeyRegistered: boolean;
  adminPublicKeyFingerprint?: string;
  sites: CompanySite[];
  invitations: EmployeeInvitation[];
}
