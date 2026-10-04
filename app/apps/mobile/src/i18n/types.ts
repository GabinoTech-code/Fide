export type SupportedLanguage =
  | 'it'
  | 'es'
  | 'en'
  | 'ro'
  | 'ar'
  | 'sq'
  | 'uk'
  | 'fr'
  | 'zh';

export interface LanguageMeta {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  direction?: 'ltr' | 'rtl';
}

export const LANGUAGES: LanguageMeta[] = [
  { code: 'it', name: 'Italiano', nativeName: 'Italiano (Ufficiale)', flag: '🇮🇹', direction: 'ltr' },
  { code: 'es', name: 'Español', nativeName: 'Español', flag: '🇪🇸', direction: 'ltr' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', direction: 'ltr' },
  { code: 'ro', name: 'Rumano', nativeName: 'Română', flag: '🇷🇴', direction: 'ltr' },
  { code: 'ar', name: 'Árabe', nativeName: 'العربية', flag: '🇲🇦', direction: 'rtl' },
  { code: 'sq', name: 'Albanés', nativeName: 'Shqip', flag: '🇦🇱', direction: 'ltr' },
  { code: 'uk', name: 'Ucraniano', nativeName: 'Українська', flag: '🇺🇦', direction: 'ltr' },
  { code: 'fr', name: 'Francés', nativeName: 'Français', flag: '🇫🇷', direction: 'ltr' },
  { code: 'zh', name: 'Chino', nativeName: '中文', flag: '🇨🇳', direction: 'ltr' },
];

export interface TranslationStrings {
  // Tabs
  tabHome: string;
  tabClock: string;
  tabRequests: string;
  tabDocs: string;
  tabAssistant: string;

  // Common
  save: string;
  cancel: string;
  close: string;
  back: string;
  today: string;
  days: string;
  hours: string;
  online: string;
  offline: string;

  // Login
  heroTitle: string;
  heroSubtitle: string;
  verifiedDevice: string;
  activatePasskey: string;
  verifyingPasskey: string;
  passkeyFootnote: string;

  // Home
  greeting: string;
  statusClockedIn: string;
  statusClockedOutPrefix: string;
  statusClockedOutSuffix: string;
  btnClockIn: string;
  btnClockOut: string;
  vacation: string;
  permits: string;
  actionAbsence: string;
  actionExpense: string;
  actionShifts: string;
  actionAssistant: string;
  notices: string;
  noNotices: string;

  // Clock (Fichar / Timbratura)
  clockTitle: string;
  clockSubtitle: string;
  verificationMethod: string;
  methodGeo: string;
  methodGeoInfo: string;
  methodQr: string;
  methodQrInfo: string;
  methodNfc: string;
  methodNfcInfo: string;
  offlineMode: string;
  offlineModeDesc: string;
  noPunchesToday: string;
  punchStatusSynced: string;
  punchStatusQueued: string;
  toastPunchIn: string;
  toastPunchOut: string;
  toastOfflinePunch: string;

  // Requests
  requestsTitle: string;
  requestsSubtitle: string;
  reqVac: string;
  reqPer: string;
  reqOlv: string;
  reqExt: string;
  detailSuggested: string;
  noteForManager: string;
  sendRequest: string;
  requestHistory: string;
  noRequests: string;
  noRequestsDesc: string;
  statusPending: string;
  statusApproved: string;
  statusRejected: string;
  newRequestModalTitle: string;
  newRequestModalSubtitle: string;
  reqImpactVac: string;
  reqImpactPer: string;
  reqImpactOlv: string;
  reqImpactExt: string;

  // Docs
  docsTitle: string;
  docsSubtitle: string;
  securityBanner: string;
  availableDocs: string;
  noDocs: string;
  noDocsDesc: string;
  badgeNew: string;
  docCryptoHeader: string;
  docKeyFingerprint: string;
  docVerifiedAccess: string;
  docDecryptAndOpen: string;

  // Assistant
  assistantTitle: string;
  assistantSubtitle: string;
  chatPlaceholder: string;
  typing: string;
  openRequestForm: string;
  suggestVacation: string;
  suggestShift: string;
  suggestPermit: string;
  suggestPrivacy: string;
  assistantWelcome: string;

  // Privacy
  privacyTitle: string;
  privacySubtitle: string;
  whatCompanySees: string;
  companyPunches: string;
  companyDocs: string;
  companyAssistant: string;
  togglePush: string;
  togglePushDesc: string;
  togglePasskey: string;
  togglePasskeyDesc: string;
  toggleAnalytics: string;
  toggleAnalyticsDesc: string;
  exportData: string;
  deleteData: string;
  auditTrail: string;

  // Profile modal
  profileTitle: string;
  profileSubtitle: string;
  profileHint: string;
  fullName: string;
  companyName: string;
  department: string;
  schedule: string;
  vacationQuota: string;
  permitQuota: string;
  languageSelect: string;
  resetAll: string;
}
