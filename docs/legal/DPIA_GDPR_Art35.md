# Fide — Valutazione d'Impatto sulla Protezione dei Dati (DPIA)
### Conforme all'Art. 35 del Regolamento UE 2016/679 (GDPR)
**Riferimenti normativi**: Art. 4 Legge 300/1970 (*Statuto dei Lavoratori* - Italia) · Art. 88 LOPDGDD (Spagna) · Provvedimenti del Garante per la Protezione dei Dati Personali in materia di geolocalizzazione dei dipendenti.

---

## 1. Descrizione del Trattamento e Finalità
Fide è una piattaforma per la rilevazione delle presenze e la consegna dei cedolini paga basata su crittografia a conoscenza zero (*zero-knowledge*). Il presente documento analizza l'assenza di rischi per i diritti e le libertà fondamentali dei lavoratori.

### A. Rilevazione Presenze tramite Geovalla (Geofence)
- **Principio di Minimizzazione (Art. 5.1.c GDPR)**: Il dispositivo del lavoratore calcola la vicinanza alla sede di lavoro **esclusivamente nella memoria volatile (RAM)** del proprio smartphone mediante la formula dell'emisenoverso (*Haversine*).
- **Assenza di Coordinate GPS inviate al Datore di Lavoro**: Al server dell'azienda viene trasmesso unicamente l'esito booleano (`in_geofence: true/false`), il timestamp e la firma crittografica `Ed25519`.
- **Nessun Tracciamento Continuo**: L'accesso ai servizi di localizzazione del sistema operativo avviene **esclusivamente al momento della marcatura volontaria** da parte del dipendente. L'app non esegue processi di geolocalizzazione in background.

### B. Chiosco con QR Dinamico Rotativo
- La sede aziendale espone un codice QR rigenerato ogni 30 secondi con firma crittografica HMAC-SHA256.
- Questo metodo elimina il rischio di timbrature per conto terzi (*buddy punching*) senza richiedere l'elaborazione di dati biometrici centralizzati sul server.

### C. Autenticazione FIDO2 Passkey (Zero Password)
- L'autenticazione biometrica (Face ID / Touch ID / Windows Hello) avviene **localmente all'interno dell'enclave sicuro del dispositivo (Secure Enclave / TEE)**.
- Nessun dato biometrico grezzo (impronta digitale o scansione facciale) abbandona mai lo smartphone né transita su reti telematiche.

---

## 2. Valutazione di Necessità e Proporzionalità

| Profilo | Soluzioni Tradizionali (es. Badge GPS / Riconoscimento Facciale) | Soluzione Adottata da Fide |
| :--- | :--- | :--- |
| **Controllo a distanza** | Rischio elevato di controllo continuo della posizione del lavoratore. | **Nessun controllo a distanza**: zero coordinate GPS trasmesse o archiviate. |
| **Dati Biometrici** | Centralizzazione di template biometrici su database aziendali (altissimo rischio). | **Biometria solo locale**: credenziale asimmetrica FIDO2 (WebAuthn). |
| **Conservazione** | Tracciamento cronistorico dei movimenti del dipendente. | Solo data e ora dell'ingresso/uscita contrattuale. |

---

## 3. Misure Tecniche e di Sicurezza (Art. 32 GDPR)
1. **Cifratura End-to-End dei Documenti**: Utilizzo di librerie crittografiche verificate (*libsodium*: X25519 per lo scambio chiavi e XChaCha20-Poly1305 per il payload).
2. **Audit Trail Immutabile**: Registro delle operazioni visibile in modalità trasparente sia al dipendente che al datore di lavoro.
3. **Diritti Self-Service (Art. 15, 17, 20)**: Strumenti integrati nell'app per il download istantaneo in formato aperto (`JSON`/`CSV`) e la revoca immediata delle chiavi crittografiche (*key shredding*).

---

## 4. Conclusioni del Responsabile della Protezione dei Dati (DPO)
Il trattamento dei dati personali mediante la tecnologia Fide risulta **pienamente conforme** al GDPR e alle disposizioni lavoristiche a tutela della dignità del dipendente, non richiedendo autorizzazioni preventive da parte dell'Ispettorato del Lavoro per l'installazione di impianti audiovisivi o altri strumenti di controllo (Art. 4, comma 1 e 2, L. 300/1970).
