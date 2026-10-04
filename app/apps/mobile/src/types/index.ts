export interface UserProfile {
  id: string;
  name: string;
  company: string;
  department: string;
  vacationQuotaDays: number;
  vacationUsedDays: number;
  permitQuotaHours: number;
  permitUsedHours: number;
  shiftSchedule: string;
}

export type VerificationMethod = 'geo' | 'qr' | 'nfc';

export interface MethodDefinition {
  key: VerificationMethod;
  label: string;
  info: string;
}

export interface PunchRecord {
  id: string;
  timestamp: number;
  timeFormatted: string;
  dateFormatted: string;
  type: 'Entrada' | 'Salida';
  method: string;
  methodKey: VerificationMethod;
  status: string;
  queued: boolean;
  signature: string;
  queueId?: string;
}

export type RequestCategory = 'vac' | 'per' | 'olv' | 'ext';

export interface AbsenceRequest {
  id: string;
  category: RequestCategory;
  categoryLabel: string;
  detail: string;
  impact: string;
  note?: string;
  status: 'Pendiente' | 'Aprobada' | 'Rechazada';
  createdAt: number;
  dateFormatted: string;
}

export interface CryptoMetadata {
  algorithm: string;
  issuerPublicKeyFingerprint: string;
  recipientPublicKeyFingerprint: string;
  nonce: string; // 24-byte hex
  poly1305Tag: string; // 16-byte MAC tag
  sha256Hash: string;
  signatureVerified: boolean;
}

export interface DocumentAccessLog {
  id: string;
  timestamp: number;
  formattedDate: string;
  actor: string;
  action: string;
  deviceFingerprint: string;
  success: boolean;
}

export interface DecryptedDocumentPayload {
  documentId: string;
  title: string;
  issueDate: string;
  grossAmount?: string;
  netAmount?: string;
  inpsContribution?: string;
  irpefTax?: string;
  details: { label: string; value: string }[];
}

export interface DocumentItem {
  id: string;
  nombre: string;
  meta: string;
  nuevo: boolean;
  category: 'payroll' | 'certificate' | 'report';
  crypto: CryptoMetadata;
  accessLogs: DocumentAccessLog[];
  payload: DecryptedDocumentPayload;
}

export interface NoticeItem {
  id: string;
  title: string;
  subtitle: string;
  type: 'doc' | 'circular' | 'info';
  read: boolean;
  actionScreen?: 'docs' | 'solicitudes' | 'fichar';
}

export interface ChatMessage {
  id: string;
  from: 'user' | 'bot';
  text: string;
  timestamp: number;
  actionCategory?: RequestCategory;
}

export interface PrivacySettings {
  push: boolean;
  pk: boolean;
  an: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  formatted: string;
  actor: string;
  action: string;
}
