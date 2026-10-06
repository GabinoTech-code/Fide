import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  UserProfile,
  PunchRecord,
  VerificationMethod,
  AbsenceRequest,
  DocumentItem,
  DocumentAccessLog,
  NoticeItem,
  ChatMessage,
  PrivacySettings,
  AuditEntry,
  RequestCategory,
} from '../types';
import { StorageService } from '../services/storage';
import { generateAssistantResponse } from '../services/assistantEngine';
import {
  SupportedLanguage,
  TranslationStrings,
  DEFAULT_LANGUAGE,
  getTranslation,
} from '../i18n';

export type ScreenType = 'home' | 'fichar' | 'solicitudes' | 'docs' | 'asistente' | 'privacidad';

interface AppContextType {
  // Navigation & UI
  currentScreen: ScreenType;
  setCurrentScreen: (screen: ScreenType) => void;
  toast: string | null;
  showToast: (msg: string) => void;

  // Language & i18n
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: TranslationStrings;

  // Auth / User
  isLoggedIn: boolean;
  login: () => void;
  logout: () => void;
  user: UserProfile;
  updateUser: (updated: UserProfile) => Promise<void>;
  resetAllData: () => Promise<void>;

  // Time & Punching
  clockedIn: boolean;
  clockStart: number;
  elapsedFormatted: string;
  elapsedSeconds: number;
  selectedMethod: VerificationMethod;
  setSelectedMethod: (m: VerificationMethod) => void;
  offlineMode: boolean;
  toggleOffline: () => void;
  punches: PunchRecord[];
  recordPunch: () => void;

  // Requests
  requests: AbsenceRequest[];
  addRequest: (category: RequestCategory, detail: string, impact: string, note?: string) => void;

  // Documents
  documents: DocumentItem[];
  markDocumentRead: (docId: string) => void;

  // Notices
  notices: NoticeItem[];
  dismissNotice: (id: string) => void;

  // Chat
  chatMessages: ChatMessage[];
  isTyping: boolean;
  sendChatMessage: (text: string) => void;

  // Privacy & RGPD
  privacySettings: PrivacySettings;
  togglePrivacySetting: (key: keyof PrivacySettings) => void;
  auditLogs: AuditEntry[];
  exportDataJson: () => string;
}

const DEFAULT_USER: UserProfile = {
  id: 'usr_fide_01',
  name: 'Collaboratore',
  company: 'Officine Aurora S.r.l.',
  department: 'Operazioni',
  vacationQuotaDays: 22,
  vacationUsedDays: 7.5,
  permitQuotaHours: 32,
  permitUsedHours: 8,
  shiftSchedule: '08:30 - 17:30',
};

const DEFAULT_SETTINGS: PrivacySettings = {
  push: true,
  pk: true,
  an: false,
};

const DEFAULT_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc_nom_act',
    nombre: 'Cedolino paga mensile',
    meta: 'PDF · 185 KB · Cifrato',
    nuevo: true,
    category: 'payroll',
    crypto: {
      algorithm: 'X25519 + XChaCha20-Poly1305 (libsodium)',
      issuerPublicKeyFingerprint: '7F3A 91C2 0B4E D815 66AF 2C90',
      recipientPublicKeyFingerprint: '4B8F 91E2 7A30 D915 88CE 3F11',
      nonce: 'a7c390f1b24e8812c30198f2441a770281b9034e72c81910',
      poly1305Tag: '99e2f418b70a1c6204481b9e28f3a092',
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      signatureVerified: true,
    },
    accessLogs: [
      {
        id: 'log_em_1',
        timestamp: Date.now() - 3600000 * 24,
        formattedDate: 'Ieri · 10:15',
        actor: 'Ufficio HR / Amministrazione',
        action: 'Cifratura end-to-end con chiave pubblica destinatario',
        deviceFingerprint: '7F3A 91C2 0B4E D815 66AF 2C90',
        success: true,
      },
    ],
    payload: {
      documentId: 'doc_nom_act',
      title: 'Prospetto paga - Competenze e trattenute',
      issueDate: 'Periodo di retribuzione corrente',
      grossAmount: '€ 2.450,00',
      netAmount: '€ 1.842,50',
      inpsContribution: '€ 225,15',
      irpefTax: '€ 382,35',
      details: [
        { label: 'Livello / Qualifica CCNL', value: 'Impiegato 3° Livello' },
        { label: 'Giorni lavorati nel mese', value: '21 giorni (168 ore)' },
        { label: 'Straordinari retribuiti', value: '1,5 ore (maggiorazione 25%)' },
        { label: 'Ferie residue / maturate', value: '14,5 giorni' },
        { label: 'TFR accantonato nel mese', value: '€ 172,40' },
      ],
    },
  },
  {
    id: 'doc_cu_act',
    nombre: 'Certificazione Unica (CU)',
    meta: 'PDF · 240 KB · Cifrato',
    nuevo: false,
    category: 'certificate',
    crypto: {
      algorithm: 'X25519 + XChaCha20-Poly1305 (libsodium)',
      issuerPublicKeyFingerprint: '7F3A 91C2 0B4E D815 66AF 2C90',
      recipientPublicKeyFingerprint: '4B8F 91E2 7A30 D915 88CE 3F11',
      nonce: 'b94101e4a28f117c093a887b419c831b44c8038290f19a02',
      poly1305Tag: '14ab77c0f188392a83e01bc89a3f901e',
      sha256Hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      signatureVerified: true,
    },
    accessLogs: [
      {
        id: 'log_em_cu',
        timestamp: Date.now() - 3600000 * 72,
        formattedDate: '3 giorni fa · 09:30',
        actor: 'Ufficio Fiscale / HR',
        action: 'Cifratura CU annuale per dichiarazione dei redditi',
        deviceFingerprint: '7F3A 91C2 0B4E D815 66AF 2C90',
        success: true,
      },
    ],
    payload: {
      documentId: 'doc_cu_act',
      title: 'Certificazione Unica dei redditi di lavoro dipendente',
      issueDate: 'Anno fiscale corrente',
      grossAmount: '€ 29.400,00',
      details: [
        { label: 'Redditi di lavoro dipendente', value: '€ 29.400,00' },
        { label: 'Ritenute IRPEF totali operate', value: '€ 5.210,00' },
        { label: 'Addizionale regionale e comunale', value: '€ 640,00' },
        { label: 'Contributi previdenziali a carico dipendente', value: '€ 2.690,00' },
      ],
    },
  },
];

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [toast, setToast] = useState<string | null>(null);
  const [toastTimeout, setToastTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Default language is Italian ('it')
  const [language, setLanguageState] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const t = getTranslation(language);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true);
  const [user, setUser] = useState<UserProfile>(DEFAULT_USER);

  const [clockedIn, setClockedIn] = useState<boolean>(false);
  const [clockStart, setClockStart] = useState<number>(0);
  const [tickSeconds, setTickSeconds] = useState<number>(0);
  const [selectedMethod, setSelectedMethod] = useState<VerificationMethod>('geo');
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [punches, setPunches] = useState<PunchRecord[]>([]);

  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState<boolean>(false);

  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

  // Show Toast
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimeout) clearTimeout(toastTimeout);
    const timeout = setTimeout(() => {
      setToast(null);
    }, 3000);
    setToastTimeout(timeout);
  }, [toastTimeout]);

  // Load Initial Data from Storage
  useEffect(() => {
    async function loadData() {
      const savedLang = await StorageService.getItem<SupportedLanguage>('fide_language', DEFAULT_LANGUAGE);
      setLanguageState(savedLang);

      const savedUser = await StorageService.getItem<UserProfile>('fide_user', DEFAULT_USER);
      setUser(savedUser);

      const savedClocked = await StorageService.getItem<boolean>('fide_clocked', false);
      const savedClockStart = await StorageService.getItem<number>('fide_clock_start', 0);
      setClockedIn(savedClocked);
      setClockStart(savedClockStart);

      const savedPunches = await StorageService.getItem<PunchRecord[]>('fide_punches', []);
      setPunches(savedPunches);

      const savedRequests = await StorageService.getItem<AbsenceRequest[]>('fide_requests', []);
      setRequests(savedRequests);

      const savedDocuments = await StorageService.getItem<DocumentItem[]>('fide_documents', DEFAULT_DOCUMENTS);
      setDocuments(savedDocuments);

      const savedNotices = await StorageService.getItem<NoticeItem[]>('fide_notices', [
        {
          id: 'not_1',
          title: 'Cedolino paga disponibile',
          subtitle: 'Cifrato end-to-end con la tua chiave pubblica',
          type: 'doc',
          read: false,
          actionScreen: 'docs',
        },
      ]);
      setNotices(savedNotices);

      const initialTranslation = getTranslation(savedLang);
      const savedChat = await StorageService.getItem<ChatMessage[]>('fide_chat', [
        {
          id: 'c_0',
          from: 'bot',
          text: initialTranslation.assistantWelcome,
          timestamp: Date.now(),
        },
      ]);
      setChatMessages(savedChat);

      const savedSettings = await StorageService.getItem<PrivacySettings>('fide_settings', DEFAULT_SETTINGS);
      setPrivacySettings(savedSettings);

      const savedLogs = await StorageService.getItem<AuditEntry[]>('fide_audit', [
        {
          id: 'aud_1',
          timestamp: Date.now() - 3600000 * 24,
          formatted: 'Dispositivo associato · Chiavi FIDO2 locali generate',
          actor: 'Tu',
          action: 'Associazione FIDO2',
        },
      ]);
      setAuditLogs(savedLogs);
    }

    loadData();
  }, []);

  // Timer loop when clocked in
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (clockedIn && clockStart > 0) {
      const updateElapsed = () => {
        const diff = Math.max(0, Math.floor((Date.now() - clockStart) / 1000));
        setTickSeconds(diff);
      };
      updateElapsed();
      interval = setInterval(updateElapsed, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [clockedIn, clockStart]);

  const elapsedSeconds = clockedIn && clockStart > 0 ? tickSeconds : 0;

  // Format Elapsed Time
  const formatTime = (totalSecs: number) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const elapsedFormatted = formatTime(elapsedSeconds);

  // Language switcher
  const setLanguage = async (newLang: SupportedLanguage) => {
    setLanguageState(newLang);
    await StorageService.setItem('fide_language', newLang);
    const newTrans = getTranslation(newLang);
    showToast(newTrans.save);
  };

  // Authentication
  const login = () => {
    setIsLoggedIn(true);
    showToast(t.toastPunchIn);
  };

  const logout = () => {
    setIsLoggedIn(false);
  };

  const updateUser = async (updated: UserProfile) => {
    setUser(updated);
    await StorageService.setItem('fide_user', updated);
    showToast(t.save);
  };

  const resetAllData = async () => {
    await StorageService.clear();
    setUser(DEFAULT_USER);
    setLanguageState(DEFAULT_LANGUAGE);
    setClockedIn(false);
    setClockStart(0);
    setPunches([]);
    setRequests([]);
    setDocuments([]);
    setNotices([]);
    setPrivacySettings(DEFAULT_SETTINGS);
    const initialT = getTranslation(DEFAULT_LANGUAGE);
    setChatMessages([
      {
        id: 'c_init',
        from: 'bot',
        text: initialT.assistantWelcome,
        timestamp: Date.now(),
      },
    ]);
    showToast(initialT.resetAll);
  };

  // Clock Actions
  const recordPunch = async () => {
    const now = new Date();
    const isClockingIn = !clockedIn;
    const newStart = isClockingIn ? Date.now() : clockStart;

    const pad = (n: number) => String(n).padStart(2, '0');
    const timeFormatted = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dateFormatted = now.toLocaleDateString(language === 'it' ? 'it-IT' : 'es-ES', {
      day: 'numeric',
      month: 'short',
    });

    const methodLabels: Record<VerificationMethod, string> = {
      geo: t.methodGeo,
      qr: t.methodQr,
      nfc: t.methodNfc,
    };

    const signature = `SIG_ED25519_${Math.random().toString(36).substring(2, 9).toUpperCase()}_DEV`;
    const newPunch: PunchRecord = {
      id: `punch_${Date.now()}`,
      timestamp: now.getTime(),
      timeFormatted,
      dateFormatted,
      type: isClockingIn ? 'Entrada' : 'Salida',
      method: methodLabels[selectedMethod],
      methodKey: selectedMethod,
      status: offlineMode ? t.punchStatusQueued : t.punchStatusSynced,
      queued: offlineMode,
      signature,
      queueId: offlineMode ? `sync_queue_${Date.now()}` : undefined,
    };

    const updatedPunches = [newPunch, ...punches];
    setPunches(updatedPunches);
    setClockedIn(isClockingIn);
    setClockStart(newStart);

    await StorageService.setItem('fide_clocked', isClockingIn);
    await StorageService.setItem('fide_clock_start', newStart);
    await StorageService.setItem('fide_punches', updatedPunches);

    // Add audit entry
    const newAudit: AuditEntry = {
      id: `aud_${Date.now()}`,
      timestamp: Date.now(),
      formatted: `${dateFormatted} ${timeFormatted} · ${isClockingIn ? t.btnClockIn : t.btnClockOut} (${newPunch.method})`,
      actor: t.today,
      action: t.clockTitle,
    };
    const updatedAudit = [newAudit, ...auditLogs];
    setAuditLogs(updatedAudit);
    await StorageService.setItem('fide_audit', updatedAudit);

    if (offlineMode) {
      showToast(t.toastOfflinePunch);
    } else {
      showToast(isClockingIn ? t.toastPunchIn : t.toastPunchOut);
    }
  };

  const toggleOffline = async () => {
    if (offlineMode) {
      const hadQueue = punches.some((p) => p.queued);
      const syncedPunches = punches.map((p) =>
        p.queued ? { ...p, queued: false, status: t.punchStatusSynced } : p
      );
      setPunches(syncedPunches);
      setOfflineMode(false);
      await StorageService.setItem('fide_punches', syncedPunches);
      if (hadQueue) {
        showToast(t.punchStatusSynced);
      } else {
        showToast(t.online);
      }
    } else {
      setOfflineMode(true);
      showToast(t.offline);
    }
  };

  // Absence Requests
  const addRequest = async (
    category: RequestCategory,
    detail: string,
    impact: string,
    note?: string
  ) => {
    const categoryLabels: Record<RequestCategory, string> = {
      vac: t.reqVac,
      per: t.reqPer,
      olv: t.reqOlv,
      ext: t.reqExt,
    };

    const now = new Date();
    const newReq: AbsenceRequest = {
      id: `req_${Date.now()}`,
      category,
      categoryLabel: categoryLabels[category],
      detail,
      impact,
      note,
      status: 'Pendiente',
      createdAt: now.getTime(),
      dateFormatted: now.toLocaleDateString(language === 'it' ? 'it-IT' : 'es-ES', {
        day: 'numeric',
        month: 'short',
      }),
    };

    const updated = [newReq, ...requests];
    setRequests(updated);
    await StorageService.setItem('fide_requests', updated);
    showToast(t.sendRequest);
  };

  // Documents
  const markDocumentRead = async (docId: string) => {
    const now = new Date();
    const formattedDate = `${t.today} · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let targetDocName = '';
    const updated = documents.map((d) => {
      if (d.id === docId) {
        targetDocName = d.nombre;
        const newLog: DocumentAccessLog = {
          id: `log_dec_${Date.now()}`,
          timestamp: now.getTime(),
          formattedDate,
          actor: `Tu (${user.name})`,
          action: 'Decifratura con chiave privata locale X25519',
          deviceFingerprint: d.crypto.recipientPublicKeyFingerprint,
          success: true,
        };
        return {
          ...d,
          nuevo: false,
          accessLogs: [newLog, ...d.accessLogs],
        };
      }
      return d;
    });

    setDocuments(updated);
    await StorageService.setItem('fide_documents', updated);

    // Append to global audit log
    const globalAudit: AuditEntry = {
      id: `aud_doc_${Date.now()}`,
      timestamp: Date.now(),
      formatted: `${formattedDate} · Decifratura documento (${targetDocName})`,
      actor: 'Tu',
      action: 'Accesso E2EE',
    };
    const updatedAudit = [globalAudit, ...auditLogs];
    setAuditLogs(updatedAudit);
    await StorageService.setItem('fide_audit', updatedAudit);

    showToast(t.docDecryptAndOpen);
  };

  // Notices
  const dismissNotice = async (id: string) => {
    const updated = notices.filter((n) => n.id !== id);
    setNotices(updated);
    await StorageService.setItem('fide_notices', updated);
  };

  // Chat
  const sendChatMessage = (text: string) => {
    if (!text.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      from: 'user',
      text: text.trim(),
      timestamp: Date.now(),
    };

    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setIsTyping(true);

    setTimeout(() => {
      const response = generateAssistantResponse(text, {
        user,
        clockedIn,
        elapsedSeconds,
        punches,
        requests,
        language,
      });

      const botMsg: ChatMessage = {
        id: `msg_bot_${Date.now()}`,
        from: 'bot',
        text: response.text,
        timestamp: Date.now(),
        actionCategory: response.actionCategory,
      };

      const finalMessages = [...newMessages, botMsg];
      setChatMessages(finalMessages);
      setIsTyping(false);
      StorageService.setItem('fide_chat', finalMessages);
    }, 800);
  };

  // Privacy Settings
  const togglePrivacySetting = async (key: keyof PrivacySettings) => {
    const updated = { ...privacySettings, [key]: !privacySettings[key] };
    setPrivacySettings(updated);
    await StorageService.setItem('fide_settings', updated);
    showToast(t.save);
  };

  const exportDataJson = () => {
    const data = {
      app: 'Fide Mobile',
      version: '1.0.0',
      language,
      exportedAt: new Date().toISOString(),
      user,
      punches,
      requests,
      documentsCount: documents.length,
      privacySettings,
      auditLogs,
    };
    return JSON.stringify(data, null, 2);
  };

  return (
    <AppContext.Provider
      value={{
        currentScreen,
        setCurrentScreen,
        toast,
        showToast,
        language,
        setLanguage,
        t,
        isLoggedIn,
        login,
        logout,
        user,
        updateUser,
        resetAllData,
        clockedIn,
        clockStart,
        elapsedFormatted,
        elapsedSeconds,
        selectedMethod,
        setSelectedMethod,
        offlineMode,
        toggleOffline,
        punches,
        recordPunch,
        requests,
        addRequest,
        documents,
        markDocumentRead,
        notices,
        dismissNotice,
        chatMessages,
        isTyping,
        sendChatMessage,
        privacySettings,
        togglePrivacySetting,
        auditLogs,
        exportDataJson,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
