# Fide — Data Processing Agreement (DPA)
### Accordo sul Trattamento dei Dati Personali ai sensi dell'Art. 28 del Regolamento UE 2016/679

**TRA:**
- **Il Datore di Lavoro / Azienda Cliente** (di seguito *"Titolare del Trattamento"*);
- **Fide Technologies S.r.l.** (di seguito *"Responsabile del Trattamento"* o *"Fide"*).

---

## 1. Oggetto e Ambito dell'Accordo
Il presente Accordo disciplina le condizioni in base alle quali Fide tratta i dati personali per conto del Titolare nell'erogazione dei servizi di rilevazione presenze, gestione delle assenze e distribuzione di cedolini paga mediante la piattaforma software Fide.

## 2. Architettura Criptografica a Conoscenza Zero (Zero-Knowledge)
Il Titolare prende atto e approva che i sistemi Fide sono progettati secondo il paradigma di *crittografia a conoscenza zero*:
1. **Cedolini e Documenti Retributivi**: I file caricati dal Titolare vengono cifrati con algoritmo asimmetrico **X25519 + XChaCha20-Poly1305** utilizzando la chiave pubblica del lavoratore. Fide non possiede né memorizza la chiave privata di decifratura e non è tecnicamente in grado di accedere in chiaro ai dati economici e fiscali dei lavoratori.
2. **Presenze e Timbrature**: Il Responsabile del Trattamento non acquisisce coordinate satellitari GPS continue. Il calcolo della geovalla avviene in RAM locale sul dispositivo mobile dell'interessato.
3. **Notifiche Push Cifrate**: Le notifiche inviate tramite APNs (Apple) e FCM (Google) trasportano payload cifrati incomprensibili ai gestori delle reti di notifica.

## 3. Obblighi del Responsabile del Trattamento (Fide)
Fide si impegna a:
- Trattare i dati personali unicamente secondo le istruzioni documentate fornite dal Titolare;
- Assicurare che il personale autorizzato sia vincolato da rigorosi obblighi di riservatezza;
- Applicare misure di sicurezza adeguate ai sensi dell'Art. 32 del GDPR (cifratura asimmetrica, audit log inmutabili, protezione da accessi non autorizzati);
- Assistere il Titolare nell'evadere le richieste di esercizio dei diritti degli interessati (Art. 15, 17, 20 GDPR);
- Conservare i dati sui server situati esclusivamente all'interno dello Spazio Economico Europeo (SEE).

## 4. Sub-Responsabili del Trattamento
Fide si avvale unicamente di fornitori di infrastruttura cloud certificati ISO 27001 e SOC 2 situati nell'Unione Europea per l'hosting dei database e dei container di elaborazione.
