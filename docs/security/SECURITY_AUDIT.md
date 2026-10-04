# Fide — Rapporto di Audit di Sicurezza e Verifica Crittografica
### Piattaforma Zero-Knowledge HR & Presenze Privacy-First
**Classificazione**: Documento di Sicurezza e Conformità Tecnico-Legale  
**Standard di Riferimento**: OWASP Mobile Top 10 · NIST SP 800-63B (AAL3) · Regolamento UE 2016/679 (GDPR Art. 25 & 32) · Statuto dei Lavoratori (L. 300/1970 Art. 4)

---

## 1. Sintesi Esecutiva (Executive Summary)

La piattaforma **Fide** è stata sottoposta a un audit completo di sicurezza dell'architettura del software, dei flussi crittografici, dell'isolamento dei dati e della conformità alle direttive sulla privacy.

L'architettura adotta il principio del **Privilegio Minimo (Least Privilege)** e della **Conoscenza Zero (Zero-Knowledge)**:
- I server e gli amministratori del sistema **non possono accedere in chiaro** ai dati economici o salariali dei lavoratori contenuti nei cedolini paga.
- Il datore di lavoro **non può monitorare la posizione geografica continua** del dipendente: il calcolo della prossimità avviene in memoria RAM volatile sul dispositivo del lavoratore.
- L'autenticazione è priva di password (*Zero-Password*), eliminando i vettori di attacco di tipo *credential stuffing*, *phishing* e violazione del database delle password.

---

## 2. Valutazione dell'Architettura Crittografica

| Componente | Algoritmo Criptografico | Dimensione Chiave / Nonce | Livello di Sicurezza | Stato Verifica |
| :--- | :--- | :--- | :--- | :--- |
| **Cifratura Documenti / Buste Paga** | **XChaCha20-Poly1305 (AEAD)** | Chiave: 256-bit<br>Nonce: 192-bit (24 byte)<br>Tag: 128-bit (16 byte) | Cifratura autenticata di livello militare (libsodium). Il nonce esteso a 192 bit elimina il rischio di riutilizzo accidentale del nonce. | **CONFORME** |
| **Scambio Chiavi Asimmetrico** | **X25519 (ECDH su Curve25519)** | 256-bit (32 byte) | Crittografia a curva ellittica ad alte prestazioni. La chiave privata risiede unicamente nel Secure Enclave dello smartphone. | **CONFORME** |
| **Firma Timbrature Presenze** | **Ed25519 (EdDSA)** | 256-bit | Firma asimmetrica non ripudiabile generata sul dispositivo per ogni timbratura online/offline. | **CONFORME** |
| **Autenticazione Utente** | **FIDO2 / WebAuthn (Passkey)** | Curve P-256 / Ed25519 | Autenticazione biometrica hardware isolata. Nessun dato biometrico trasmesso. | **CONFORME** |
| **Chiosco Ingresso Sede** | **HMAC-SHA256 (TOTP Window 30s)** | Chiave: 256-bit<br>Finestra: 30 secondi | Previene attacchi di replay: fotografie o screenshot del QR scadono entro 30 secondi. | **CONFORME** |

---

## 3. Privacy-by-Design & Analisi dei Flussi di Dati

### A. Geovalla sul Dispositivo (Zero Coordinate Trasmessa)
- **Minaccia analizzata**: Sorveglianza illecita e controllo a distanza del lavoratore (violazione dell'Art. 4 della Legge 300/1970 e GDPR).
- **Controllo implementato**:
  1. Le coordinate GPS provvisorie vengono lette solo durante il tocco volontario del pulsante di timbratura.
  2. Il calcolo della distanza (formula di *Haversine*) viene eseguito **esclusivamente nella RAM locale**.
  3. Le coordinate vengono distrutte all'istante dalla memoria.
  4. Al server viene inviato solo:
     ```json
     { "in_geofence": true, "timestamp": 1728192000000, "signature": "SIG_ED25519_..." }
     ```
  5. **Verdetto**: Rischio di tracciamento continuo eliminato alla radice (*Privacy by Design* conforme all'Art. 25 GDPR).

### B. Notifiche Push Cifrate (Zero-Knowledge APNs / FCM)
- **Minaccia analizzata**: Intercettazione dei dati salariali o personali da parte di intermediari cloud (Apple o Google).
- **Controllo implementato**:
  - Il payload della notifica push viene cifrato dal server con la chiave pubblica X25519 del lavoratore prima della trasmissione.
  - I server intermedi (APNs/FCM) vedono esclusivamente un blob opaco Base64 e un nonce casuale.
  - La decifratura avviene sul dispositivo mediante Notification Service Extension con la chiave privata locale.
  - **Verdetto**: Conoscenza zero garantita per i fornitori terzi di notifiche.

### C. Diritti RGPD Self-Service (Art. 15, 17, 20)
- **Art. 15 (Diritto di Accesso)**: Trasparenza immediata su categorie di dati, base giuridica, tempi di conservazione e contatto DPO.
- **Art. 20 (Portabilità dei Dati)**: Esportazione istantanea senza intermediari in formati standard (`JSON` e `CSV`).
- **Art. 17 (Diritto alla Cancellazione / Oblio)**: Procedura di distruzione crittografica locale delle chiavi (*Cryptographic Key Shredding*), rendendo irreversibilmente illeggibile qualsiasi copia di documento archiviata nella cache locale.

---

## 4. Sicurezza del Backend e Database (Supabase PostgreSQL)

### A. Row Level Security (RLS)
- Tutte le tabelle PostgreSQL hanno la protezione RLS abilitata per impostazione predefinita (`ENABLE ROW LEVEL SECURITY`).
- **Apertura documenti**: La politica `USING (auth.uid() = user_id)` assicura che nessun utente possa eseguire query su record di terzi.
- **Isolamento multitenant**: Ciascuna azienda è isolata e non può visualizzare i registri o i collaboratori di altre organizzazioni.

### B. Protezione dei Canali di Comunicazione
- Connessioni forzate su **TLS 1.3** con cipher suite conformi a Forward Secrecy.
- Header di sicurezza raccomandati:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`

---

## 5. Modello di Minaccia (STRIDE Threat Model)

| Categoria STRIDE | Vettore di Attacco | Contromisura Implementata in Fide | Rischio Residuo |
| :--- | :--- | :--- | :--- |
| **Spoofing (Identità falsa)** | Timbratura per conto terzi (*buddy punching*) o screenshot del QR. | QR rotativo con finestra di 30 secondi + firma HMAC. Autenticazione con biometria FIDO2 sul dispositivo personale. | **MOLTO BASSO** |
| **Tampering (Manomissione)** | Modifica retroattiva dell'orario di timbratura o del cedolino. | Firma crittografica **Ed25519** generata alla fonte dal dispositivo e verifica del MAC tag **Poly1305** sul documento. | **TRASCURABILE** |
| **Repudiation (Ripudio)** | Dipendente o datore che nega l'avvenuta timbratura o emissione. | Ricevuta ufficiale con timestamp immutabile e firma asimmetrica verificabile da periti e ispettori. | **TRASCURABILE** |
| **Information Disclosure** | Dipendenti non autorizzati o amministratori IT che leggono le paghe. | Cifratura asimmetrica end-to-end **X25519 + XChaCha20-Poly1305**: solo il lavoratore possiede la chiave privata. | **MOLTO BASSO** |
| **Denial of Service** | Mancanza temporanea di connessione internet in sede o cantiere. | Architettura **Offline-First** con coda locale firmata e sincronizzazione automatica al ripristino della rete. | **BASSO** |
| **Elevation of Privilege** | Tentativo di accesso come amministratore aziendale. | Autenticazione FIDO2 Hardware-Bound (AAL3) con enclave sicuro di sistema. | **MOLTO BASSO** |

---

## 6. Audit delle Dipendenze

- Eseguito controllo con `npm audit`. Le segnalazioni identificate appartengono a dipendenze di compilazione/sviluppo del bundler Metro/Expo (`braces`, `decode-uri-component` nel tooling di packaging), che **non sono incluse né eseguite nel codice di produzione compilato sui dispositivi mobili**.
- I motori crittografici utilizzano implementazioni native e librerie verificate senza dipendenze vulnerabili a runtime.

---

## 7. Raccomandazioni per la Messa in Produzione
1. **Configurazione Chiavi Segrete**: Mantenere la chiave `service_role` di Supabase esclusivamente nelle variabili di ambiente del server CI/CD, senza mai includerla nel codice client dell'applicazione.
2. **Apple App Store / Google Play**: Abilitare l'obbligatorietà del Keychain Access Group / Android Keystore con flag `kSecAccessControlBiometryAny` per massimizzare la protezione hardware delle chiavi X25519.
3. **Audit Periodici**: Pianificare riesami crittografici annuali o in concomitanza con aggiornamenti delle librerie matematiche di base.
