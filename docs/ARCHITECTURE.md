# Fide — Architettura del Sistema & Flussi Operativi di Produzione

> **Documento Tecnico di Architettura di Sistema**  
> Piattaforma di rilevazione presenze, gestione HR e distribuzione buste paga con **crittografia a conoscenza zero (Zero-Knowledge)**.

---

## 1. Mappa Globale dei Componenti

```mermaid
flowchart TB
    subgraph ClientLayer["Livello Client (Dispositivi Utente)"]
        Mobile["📱 App Mobile Fide (iOS / Android)\n· Enclave Sicuro (FaceID/TouchID)\n· Calcolo Geovalla in RAM (Haversine)\n· Chiavi Locali X25519 / Ed25519\n· Coda Offline con Firma Locale"]
        WebAdmin["🏢 Portale Web Aziendale (HR / Amministrazione)\n· Autenticazione FIDO2 WebAuthn\n· Monitor Presenze in Tempo Reale\n· Suddivisione e Cifratura Buste Paga\n· Gestione Ferie e Permessi"]
        Kiosk["📍 Chiosco Sede (Tablet all'Ingresso)\n· Generazione Token QR Rotativo (30s)\n· Firma Crittografica HMAC-SHA256"]
    end

    subgraph BackendLayer["Livello Backend & API Gateway"]
        API["⚙️ Fide Core API Gateway (Node.js/TypeScript)\n· Verifica Sfide FIDO2 WebAuthn\n· Directory Chiavi Pubbliche X25519\n· Ricezione Code Offline & Ricevute\n· Relay Notifiche Push Zero-Knowledge"]
    end

    subgraph DataLayer["Livello Dati & Storage"]
        DB[("🗄️ PostgreSQL Database\n· Anagrafica Fiscale Aziende\n· Sedi e Geovalle\n· Marcature Firmate Ed25519\n· Log di Audit Immutabili")]
        S3["🔒 Object Storage (S3 / MinIO)\n· Solo Ciphertext Cifrati (XChaCha20)\n· Zero Dati in Chiaro sul Server"]
    end

    subgraph ExternalGateways["Gateway Esterni"]
        APNS["🍎 Apple APNs (Push iOS)"]
        FCM["🤖 Google FCM (Push Android)"]
    end

    Mobile <-->|HTTPS / REST| API
    WebAdmin <-->|HTTPS / REST| API
    Kiosk <-->|WebSocket| API
    API <--> DB
    API <--> S3
    API -->|Payload Cifrato Opaco| APNS
    API -->|Payload Cifrato Opaco| FCM
    APNS -->|Push Cifrato| Mobile
    FCM -->|Push Cifrato| Mobile
```

---

## 2. Flusso 1: Registrazione dell'Azienda e Amministratore (Zero Password)

Nessuna password viene creata o memorizzata per l'azienda.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Datore di Lavoro / HR
    participant Web as Portale Web Aziendale
    participant API as Fide Core API
    participant DB as Database PostgreSQL

    Admin->>Web: Inserisce dati fiscali (Partita IVA / CIF, PEC, SDI, CCNL)
    Web->>API: POST /api/v1/companies/register
    API->>API: Valida Partita IVA su VIES / Agenzia delle Entrate
    API->>Web: Restituisce Challenge FIDO2 per WebAuthn
    Web->>Admin: Richiesta Biometria (Touch ID / Windows Hello / YubiKey)
    Admin->>Web: Autenticazione biometrica completata
    Web->>API: POST /api/v1/auth/verify-passkey (Credenziale FIDO2 + Chiave Pubblica Aziendale)
    API->>DB: Salva azienda e credenziale FIDO2
    API-->>Web: Azienda registrata con successo (Sessione crittografica attiva)
```

---

## 3. Flusso 2: Invito del Lavoratore e Onboarding in < 1 Minuto

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Amministrazione HR
    participant Web as Portale Web
    participant API as Fide API
    actor Employee as Lavoratore
    participant Mobile as App Mobile Fide

    Admin->>Web: Genera invito (Nome, Reparto, Orario di lavoro)
    Web->>API: POST /api/v1/invitations/create
    API-->>Web: Link univoco (fide://invite?code=AURORA-9842&company=...)
    Admin->>Employee: Invia link via SMS / WhatsApp / Email
    Employee->>Mobile: Tocca il link sullo smartphone
    Mobile->>Mobile: Pre-carica azienda, orario e reparto
    Employee->>Mobile: Tocca "Attiva con Passkey (Biometria)"
    Mobile->>Mobile: Genera coppia chiavi X25519 (documenti) ed Ed25519 (firme) in Secure Enclave
    Mobile->>API: POST /api/v1/users/register (Chiave Pubblica X25519 / Ed25519)
    API->>API: Associa la chiave pubblica al profilo del dipendente
    API-->>Mobile: Dispositivo autorizzato e pronto all'uso
```

---

## 4. Flusso 3: Timbratura Presenze (Offline-First, Geovalla in RAM e QR Rotativo)

### A. Timbratura con Geovalla (Nessun dato GPS inviato)
```mermaid
sequenceDiagram
    autonumber
    actor Employee as Lavoratore
    participant Mobile as App Mobile (RAM)
    participant API as Fide API
    participant DB as Database

    Employee->>Mobile: Tocca "TIMBRA ENTRATA"
    Mobile->>Mobile: Acquisisce coordinate GPS temporanee in memoria RAM
    Mobile->>Mobile: Calcola distanza con formula Haversine rispetto al raggio della sede (es. 150m)
    Mobile->>Mobile: Distrugge immediatamente le coordinate GPS dalla memoria
    Mobile->>Mobile: Genera firma digitale Ed25519 su {timestamp, tipo, in_geofence: true}
    
    alt Dispositivo Online
        Mobile->>API: POST /api/v1/punches/sync (Dati + Firma Ed25519)
        API->>API: Verifica firma Ed25519 con la chiave pubblica del lavoratore
        API->>DB: Scrive la timbratura verificata nel registro immutabile
        API-->>Mobile: Ricevuta di timbratura (REC-SYNC-...)
    else Dispositivo Senza Connessione (Offline)
        Mobile->>Mobile: Salva la marcatura firmata nella coda locale (AsyncStorage/SQLite)
        Mobile-->>Employee: "Timbratura registrata in locale (firmata crittograficamente)"
        Note over Mobile,API: Quando torna la copertura internet:
        Mobile->>API: Svuota automaticamente la coda con POST /api/v1/punches/sync
        API-->>Mobile: Ricevuta ufficiale sincronizzata
    end
```

### B. Timbratura con QR Rotativo (30 Secondi)
1. Il tablet all'ingresso espone un codice QR contenente:
   `FIDE:SITE:AURORA:<finestra_temporale_30s>:<firma_HMAC_SHA256>`
2. Il dipendente inquadra il QR con l'app Fide.
3. L'app verifica la validità del timestamp. Qualsiasi foto o screenshot catturato più di 30 secondi prima viene **automaticamente rifiutato**.

---

## 5. Flusso 4: Pipeline Buste Paga E2EE (Conoscenza Zero)

Come i cedolini paga vengono distribuiti senza che né Fide né Apple/Google possano leggerli:

```mermaid
sequenceDiagram
    autonumber
    actor Gestore as Consulente del Lavoro / HR
    participant Web as Portale Web Aziendale
    participant Parser as Modulo Payroll Parser
    participant API as Fide API Server
    participant S3 as Storage Cifrato S3
    participant Push as Gateway APNs / FCM
    participant Mobile as App Mobile Dipendente

    Gestore->>Web: Carica file PDF cumulativo paghe (Zucchetti/TeamSystem/A3)
    Web->>Parser: Invia stream PDF per analisi
    Parser->>Parser: Estrae Codici Fiscali / DNI e suddivide le pagine per dipendente
    Parser->>API: Richiede chiavi pubbliche X25519 dei destinatari
    API-->>Parser: Elenco chiavi pubbliche X25519 registrate
    
    loop Per ogni dipendente
        Parser->>Parser: Genera Nonce univoco (24 byte)
        Parser->>Parser: Cifra il cedolino con X25519 + XChaCha20-Poly1305
        Parser->>S3: Carica il ciphertext binario cifrato
        Parser->>API: POST /api/v1/push/relay (Payload cifrato opaco)
        API->>Push: Inoltra pacchetto cifrato incomprensibile ad Apple/Google
        Push->>Mobile: Notifica push ricevuta
    end

    Mobile->>Mobile: Scarica il ciphertext da S3
    Mobile->>Mobile: Decifra il documento in locale con la chiave privata X25519
    Mobile-->>Mobile: Mostra imponibile lordo, netto, ferie e trattenute
```

---

## 6. Sicurezza e Separazione dei Dati

| Tipologia di Dato | Dove Risiede | Come è Protetto | Chi può leggerlo |
| :--- | :--- | :--- | :--- |
| **Dati Fiscali Aziendali** | Database PostgreSQL | Crittografia TLS in transito + AES-256 a riposo | Azienda e Fide (per adempimenti contrattuali) |
| **Coordinate GPS Lavoratore** | **Mai memorizzate** (Solo RAM volatile) | Distrutte istantaneamente dopo il calcolo Haversine | **Nessuno** (l'azienda riceve solo `in_geofence: true`) |
| **Buste Paga & Cedolini** | Object Storage S3 | **X25519 + XChaCha20-Poly1305** | **Solo il lavoratore** con la propria chiave privata sul telefono |
| **Dati Biometrici (FaceID/TouchID)** | **Secure Enclave / TEE** dello smartphone | Hardware isolation FIDO2 / WebAuthn | **Solo il processore biometrico locale** |
| **Firme delle Timbrature** | Database PostgreSQL | Algoritmo asimmetrico **Ed25519** | Verificabile dall'Ispettorato del Lavoro e dall'azienda |
