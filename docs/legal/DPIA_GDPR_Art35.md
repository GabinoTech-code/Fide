# Supporto alla valutazione d'impatto (DPIA) del titolare

> La valutazione d'impatto (art. 35 GDPR) spetta al **datore di lavoro**, titolare del trattamento. Questo
> documento gliela facilita: descrive con precisione cosa fa Fide, i rischi individuati e le misure adottate. Non è
> un parere di conformità; va valutato dal titolare con il proprio consulente o DPO.

## 1. Il trattamento in breve

Fide registra entrate e uscite dei lavoratori, gestisce ferie e permessi e consegna i cedolini. I dati trattati sono
quelli dell'allegato 1 dell'[accordo art. 28](DPA_GDPR_Art28.md). La DPIA è consigliata perché riguarda
lavoratori (interessati vulnerabili rispetto al datore) e una registrazione sistematica delle presenze.

Per i saldi di ferie e permessi HR carica totali annuali verificati con le paghe (accreditato, riporto,
utilizzato fuori Fide). Non sono estratti dai cedolini cifrati dal server. La visibilità segue le RLS delle assenze:
propri saldi al lavoratore, squadra al responsabile, azienda a HR/titolare. Nessun dettaglio ulteriore delle assenze
esterne viene richiesto; il riferimento facoltativo non deve contenere diagnosi o altri dati sanitari.

## 2. Statuto dei lavoratori, art. 4

- **Timbratura con QR del chiosco** (modalità predefinita). È uno *strumento di registrazione degli accessi e delle
  presenze* (art. 4, comma 2): non richiede accordo sindacale né autorizzazione, ma i lavoratori vanno informati
  (art. 4, comma 3, e art. 13 GDPR). Il QR cambia ogni 30 secondi e vale una sola volta, per scoraggiare le
  timbrature per conto di altri.
- **Timbratura con posizione** (opzionale, per sede). Approccio prudente: si tratta come strumento da cui può
  derivare un controllo a distanza (art. 4, comma 1). In Fide è **disattivata per ogni sede** e il titolare la
  attiva solo dopo l'accordo sindacale o l'autorizzazione dell'Ispettorato del lavoro. Anche quando è attiva, il
  telefono legge la posizione una sola volta al momento della timbratura, calcola «dentro/fuori» e invia solo
  l'esito, più l'indicazione «posizione simulata» se il sistema operativo la segnala (visibile all'HR accanto alla
  timbratura, per scoraggiare le app di posizione finta): nessuna coordinata viene trasmessa o salvata, nessun
  tracciamento continuo o in background.
- **Telefono personale non obbligatorio**: il titolare deve prevedere un'alternativa (registrazione da parte
  dell'HR con correzione tracciata).

## 3. Cosa Fide non fa, per progettazione

- **Nessuna raccolta di dati biometrici da parte di Fide.** La conferma locale del sistema operativo può usare
  impronta o Face ID se configurati, con alternativa del PIN del dispositivo. La biometria non è obbligatoria.
  L’app riceve l’esito della verifica e non acquisisce impronte o dati del volto; questi non sono comunicati al
  titolare o a Fide. Anche la verifica della passkey facoltativa è gestita dal sistema operativo. La conferma
  locale prima di firmare o aprire documenti resta attiva; non viene sostituita dal solo possesso di una sessione.
- **Nessuna intelligenza artificiale** e nessuna decisione automatizzata sulle persone (art. 22 GDPR). Fide non
  contiene sistemi di IA ai sensi del Regolamento UE 2024/1689 (AI Act), quindi non ricade nella categoria ad alto
  rischio prevista per l'IA in ambito lavorativo.
- **Nessun accesso al contenuto dei cedolini**: sono cifrati nel browser dell'HR per il telefono del lavoratore. La
  copia decifrata per la lettura resta nella memoria temporanea dell'app e si cancella al successivo avvio; il
  lavoratore può scegliere di salvarne una copia in una cartella del telefono, che da quel momento custodisce lui
  (l'app lo avvisa).

## 4. Rischi e misure

| Rischio | Misura | Rischio residuo |
| --- | --- | --- |
| Un'azienda o un dipendente vede dati altrui | Regole di accesso per riga nel database, verificate da test automatici a ogni modifica | Basso |
| Il fornitore o un attaccante legge i cedolini | Cifratura end-to-end (XChaCha20-Poly1305 + X25519); sul server solo file cifrati | Basso |
| Una chiave falsa sostituisce quella del lavoratore | Il portale blocca l'invio se la chiave cambia finché l'HR non confronta il codice di sicurezza con il telefono del lavoratore | Basso |
| Timbrature alterate o cancellate | Firma sul telefono (Ed25519) e ricevuta del server; il database non consente modifiche; correzioni approvate e registrate | Basso |
| Controllo a distanza indebito | QR come modalità predefinita; posizione disattivata, mai trasmessa, solo dopo accordo/autorizzazione | Basso |
| Telefono perso o cambiato | Nuova chiave sul nuovo telefono, revoca della precedente, riemissione dei documenti | Basso |
| Accesso abusivo al portale HR | Nessuna password: codice monouso via e-mail o passkey; ruoli separati; registro delle modifiche | Medio-basso |
| Esclusione di chi non ha o non vuole usare lo smartphone | Alternativa obbligatoria gestita dall'HR: il portale registra timbrature e assenze per conto del lavoratore, con motivo obbligatorio, mai per sé stessi, e il lavoratore le vede nell'app come «registrate da HR» | Basso, se applicata |
| Un documento arriva alla persona sbagliata | L'HR lo ritira: sparisce dall'app, la chiave che lo apre viene distrutta e il file cifrato cancellato. Se era già stato scaricato, il portale avverte che può trattarsi di una violazione da valutare e, se c'è rischio, da notificare entro 72 ore (art. 33) | Medio-basso |
| Un ex dipendente conserva l'accesso | Alla cessazione niente più timbrature né richieste; resta per 12 mesi la sola lettura dei propri documenti (cedolino finale, CU), poi l'accesso si chiude da solo. La sospensione blocca tutto subito | Basso |
| Avvisi via e-mail che rivelano dati (es. una malattia) | Le e-mail dicono solo che c'è qualcosa da vedere: mai il tipo di assenza né il contenuto dei documenti; nella coda di invio niente indirizzi né contenuti, cancellata dopo 30 giorni; fornitore UE (Brevo) | Basso |
| Richieste dei lavoratori (artt. 15–22) senza risposta nei termini | Elenco delle richieste nel portale con scadenza di un mese fissata dal database, proroga una sola volta e motivata, risposta obbligatoria e visibile al lavoratore | Basso |
| Conservazione eccessiva | Cancellazione a fine servizio; il titolare fissa i tempi in base agli obblighi sul LUL | Da definire dal titolare |

## 5. Da completare a cura del titolare

- Consultazione delle rappresentanze sindacali, se presenti, e accordo o autorizzazione solo se attiva la posizione.
- Tempi di conservazione e alternativa per chi non usa il telefono.
- Esito della valutazione e data del riesame (consigliato ogni 12 mesi o a ogni cambiamento del servizio).


## Avvisi push facoltativi (rollout da completare)

Se attivati volontariamente nella home e autorizzati dal sistema operativo, gli avvisi dicono solo «Ci sono novità
in Fide. Apri l’app per vederle», nella lingua del destinatario. Non contengono nomi, aziende, documenti, importi,
tipi di assenza o identificativi degli eventi. Il token push viene associato sul server all’utente e alla chiave
attiva del telefono, con piattaforma, data di creazione e ultimo rinnovo per cancellare registrazioni obsolete.
Expo (650 Industries, Inc.), Apple (APNs) e Google (FCM) trattano il token e il messaggio generico e possono trattare
metadati tecnici del trasporto secondo le proprie condizioni. Non sono destinatari dei documenti o delle chiavi
private del lavoratore. Questi servizi possono comportare trasferimenti extra-UE: prima dell’attivazione per il
pilota il titolare e Fide devono documentare accordi, garanzie e fornitori effettivi. La sola autorizzazione del
telefono non sostituisce la base giuridica e la valutazione dei trasferimenti.

Puoi disattivarli nella home; se manca rete l’app segnala che la modifica non è riuscita. Il logout rimuove il token
prima di uscire. Token eliminati alla revoca del telefono, sospensione o cessazione; gli ex dipendenti conservano
l’accesso ai documenti e gli avvisi e-mail previsti. Token inattivi da 30 giorni e coda tecnica dopo 30 giorni sono
eliminati dal cron. Ticket Expo controllati dopo 15 minuti e chiusi entro 24 ore; nessuna registrazione di lettura.
Avvisi già accettati dal fornitore non richiamabili (TTL 5 minuti). Disattivando il permesso dal sistema,
riaprire la home per sincronizzare la rimozione lato server.

Rischi aggiuntivi: correlazione del token con uso di un’app di lavoro, notifiche già in transito dopo revoca,
compromissione di una chiave APNs condivisa, trasferimenti extra-UE e affidabilità non garantita. Mitigazioni:
opt-in, payload generico privo di evento o URL, RLS, binding alla chiave attiva, cancellazione dei token,
TTL breve, token Expo solo server e Enhanced Push Security. La ricezione del push non è usata per valutare persone.
Conservazione tecnica limitata a 30 giorni senza log di lettura. Test: `push.test.ts` (mobile e DB).
