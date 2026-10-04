# Fide — La Nuova Generazione di Gestione HR & Presenze Privacy-First

> **Zero-Knowledge HR & Employee Security Platform**
> Supporto nativo per **iOS e Android dal Giorno 0**, lingua ufficiale **Italiano** e supporto multi-lingua per le comunità di lavoratori immigrati in Italia e Spagna.

---

## 🛡️ Pilastri Criptografici e Privacy-by-Design

1. **Onboarding Istantaneo & Passkey FIDO2 (Biometria)**
   - Iscrizione tramite invito con link univoco o QR code (`fide://invite?code=...`).
   - Cero password: la credenziale crittografica FIDO2 (WebAuthn / Biometria hardware) viene generata in locale in meno di 60 secondi.

2. **Cifratura End-to-End dei Documenti (libsodium)**
   - Algoritmo: **X25519 (Key Exchange) + XChaCha20-Poly1305 (AEAD)**.
   - Cedolini paga, buste paga e CU cifrati con la chiave pubblica del lavoratore. La decifratura avviene esclusivamente sul dispositivo con chiave privata asimmetrica.
   - Integrità crittografica garantita con MAC tag Poly1305 e hash SHA-256.

3. **Log di Accesso Visibile (Audit Trail Inmutabile)**
   - Il lavoratore visualizza ogni singolo evento di accesso e decifratura direttamente sui documenti e nella schermata di privacy.

4. **Diritti RGPD / GDPR Self-Service**
   - **Art. 15 (Diritto di Accesso)**: Dashboard interattiva con categorie trattate, base giuridica (Art. 6.1.b/c), tempi di conservazione e contatto DPO.
   - **Art. 20 (Portabilità dei Dati)**: Esportazione istantanea in formato aperto interoperabile (`JSON` e `CSV`).
   - **Art. 17 (Diritto alla Cancellazione / Oblio)**: Generazione di istanza formale al DPO e distruzione immediata (*key shredding*) delle chiavi crittografiche locali.

5. **Timbratura Offline-First con Firma sul Dispositivo**
   - Ogni marcatura viene firmata crittograficamente con chiave `Ed25519` sul telefono e archiviata in una coda di sincronizzazione protetta.
   - Sincronizzazione automatica al ripristino della connettività con ricevuta di integrità.

6. **Verifica Presenze a Rischio Zero**
   - **Geovalla calcolata sul dispositivo**: Calcolo matematico con formula dell'emisenoverso (*Haversine*) eseguito in RAM sul telefono. All'azienda viene inviato solo l'esito booleano `in_geofence: true/false`, **zero coordinate GPS trasmesse**.
   - **QR Dinamico Rotativo**: Token HMAC-SHA256 con scadenza ogni 30 secondi. Le foto o screenshot inoltrati scadono automaticamente.
   - **NFC Contactless**: Sfida crittografica ad accoppiamento rapido (<100 ms).

7. **Notifiche Push in Tempo Reale con Payload Cifrato (Zero-Knowledge)**
   - I server di notifica intermedi (Apple APNs / Google FCM) transitano solo pacchetti cifrati opachi (ciphertext Base64 + nonce + tag). Il server non è in grado di leggere il contenuto della notifica.

---

## 🌍 Supporto Multi-Lingua (9 Lingue)

Configurato con l'**Italiano come lingua ufficiale predefinita** e localizzazione completa per le principali comunità di lavoratori in Italia e Spagna:

- 🇮🇹 **Italiano** (Ufficiale / Default)
- 🇷🇴 **Română**
- 🇲🇦 **العربية (Arabo)**
- 🇦🇱 **Shqip (Albanese)**
- 🇺🇦 **Українська (Ucraino)**
- 🇪🇸 **Español**
- 🇫🇷 **Français**
- 🇬🇧 **English**
- 🇨🇳 **中文 (Cinese)**

---

## 📱 Architettura Tecnica

- **Framework**: Expo SDK 57 (React Native 0.86, React 19)
- **Linguaggio**: TypeScript con `strict: true` (0 errori di compilazione)
- **Design Tokens**: Palette Fide (Dark Slate `#0F1A17`, Emerald Accent `#1D6F42`, Light Green `#EBF5F0`)
- **Configurazione Nativa**: iOS (`com.fide.app`, Face ID, Geofence RAM) & Android (`com.fide.app`, Biometria, Icone Adattive)

---

## 🚀 Istruzioni di Avvio

```bash
# Entra nella cartella mobile
cd app/apps/mobile

# Installa le dipendenze
npm install

# Verifica del tipo TypeScript
npm run typecheck

# Avvia il server di sviluppo Expo
npx expo start
```
