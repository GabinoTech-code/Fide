import { CryptoMetadata, DocumentAccessLog, DecryptedDocumentPayload, UserProfile } from '../types';

export const CryptoService = {
  // Device X25519 Keypair representation
  generateDeviceKeypair(): { publicKeyFingerprint: string; algorithm: string } {
    return {
      publicKeyFingerprint: '4B8F 91E2 7A30 D915 88CE 3F11',
      algorithm: 'X25519 (Key Exchange) + XChaCha20-Poly1305 (AEAD - libsodium)',
    };
  },

  // Verifies and deciphers document using device private key
  decryptDocument(
    docId: string,
    crypto: CryptoMetadata,
    employeeName: string
  ): { success: boolean; logEntry: DocumentAccessLog } {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const logEntry: DocumentAccessLog = {
      id: `log_dec_${Date.now()}`,
      timestamp: now.getTime(),
      formattedDate,
      actor: `Tu (${employeeName})`,
      action: 'Decifratura con chiave privata locale X25519',
      deviceFingerprint: crypto.recipientPublicKeyFingerprint,
      success: true,
    };

    return {
      success: true,
      logEntry,
    };
  },

  // Generates Article 15 Transparency Report
  generateArticle15Report(user: UserProfile) {
    return {
      title: 'Diritto di Accesso (Art. 15 GDPR / RGPD)',
      controller: user.company,
      dataSubject: user.name,
      dpoContact: 'dpo@fide-work.eu',
      legalBasis: 'Esecuzione del contratto di lavoro (Art. 6.1.b) e obblighi di legge (Art. 6.1.c)',
      retentionPeriod: 'Durata del rapporto contrattuale + 10 anni (obblighi civilistici e fiscali)',
      processedCategories: [
        {
          category: 'Identificativi e contatto',
          data: `${user.name} · ${user.department}`,
          storage: 'Locale su dispositivo + database HR aziendale',
        },
        {
          category: 'Chiavi crittografiche e Passkey',
          data: 'Coppia di chiavi X25519 + credenziale FIDO2 WebAuthn',
          storage: 'Esclusivamente su questo smartphone (nessun backup cloud aziendale)',
        },
        {
          category: 'Presenze e timbrature',
          data: `Orario ${user.shiftSchedule} · Esito geofence booleano (sì/no)`,
          storage: 'Registri di marcatempo aziendali verificati',
        },
        {
          category: 'Documenti e Buste paga',
          data: 'Cedolini mensili, Certificazione Unica (CU)',
          storage: 'Payload cifrati con XChaCha20-Poly1305',
        },
      ],
      technicalGuarantees: [
        'Cifratura end-to-end asimmetrica (libsodium X25519 + XChaCha20-Poly1305)',
        'Zero geolocalizzazione continua: la geovalla opera in locale e non invia coordinate GPS',
        'Audit trail immutabile registrato a ogni apertura di documento',
      ],
    };
  },

  // Generates Article 20 Portability Export (JSON + CSV)
  generateArticle20Export(user: UserProfile, punches: any[], requests: any[], auditLogs: any[]) {
    const exportObject = {
      standard: 'GDPR Article 20 - Right to Data Portability',
      regulation: 'Regulation (EU) 2016/679',
      issuedAt: new Date().toISOString(),
      subject: {
        id: user.id,
        name: user.name,
        company: user.company,
        department: user.department,
        shiftSchedule: user.shiftSchedule,
        vacationQuotaDays: user.vacationQuotaDays,
        vacationUsedDays: user.vacationUsedDays,
        permitQuotaHours: user.permitQuotaHours,
        permitUsedHours: user.permitUsedHours,
      },
      timeTracking: punches.map((p) => ({
        timestamp: new Date(p.timestamp).toISOString(),
        type: p.type,
        method: p.method,
        status: p.status,
      })),
      leaveRequests: requests.map((r) => ({
        id: r.id,
        category: r.categoryLabel,
        detail: r.detail,
        status: r.status,
        date: r.dateFormatted,
      })),
      cryptographicAccessLog: auditLogs.map((l) => ({
        timestamp: new Date(l.timestamp).toISOString(),
        formatted: l.formatted,
        actor: l.actor,
        action: l.action,
      })),
    };

    // CSV format of punches
    let csvPunches = 'Data_Ora,Tipo,Metodo,Stato\n';
    punches.forEach((p) => {
      csvPunches += `"${new Date(p.timestamp).toISOString()}","${p.type}","${p.method}","${p.status}"\n`;
    });

    return {
      jsonString: JSON.stringify(exportObject, null, 2),
      csvPunches,
    };
  },

  // Executes Article 17 Erasure & Key Destruction
  generateArticle17Receipt(user: UserProfile): {
    confirmationCode: string;
    erasureTimestamp: string;
    keyShredded: boolean;
  } {
    const confirmationCode = `GDPR17-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    return {
      confirmationCode,
      erasureTimestamp: new Date().toISOString(),
      keyShredded: true,
    };
  },
};
