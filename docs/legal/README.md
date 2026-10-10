# Documenti legali di Fide

Modelli per il programma pilota. Descrivono ciò che il software fa davvero; vanno fatti rivedere a un legale prima
dell'uso con clienti di dimensioni medio-grandi.

| Documento | A cosa serve | Chi lo firma o lo usa |
| --- | --- | --- |
| [accordo-pilota.md](accordo-pilota.md) | Durata, prezzo, obiettivi misurabili, impegni, terminale in comodato d'uso | Fide e cliente |
| [DPA_GDPR_Art28.md](DPA_GDPR_Art28.md) | Accordo per il trattamento dei dati (art. 28 GDPR), allegato all'accordo di pilota | Fide e cliente |
| [informativa-dipendenti.md](informativa-dipendenti.md) | Informativa ai lavoratori (art. 13 GDPR, art. 4 c. 3 L. 300/1970) | Il cliente la consegna ai lavoratori |
| [DPIA_GDPR_Art35.md](DPIA_GDPR_Art35.md) | Supporto alla valutazione d'impatto, che resta del cliente | Il cliente |
| [registro-trattamenti-responsabile.csv](registro-trattamenti-responsabile.csv) | Registro art. 30.2: una riga per cliente | Fide |
| [registro-trattamenti-titolare.csv](registro-trattamenti-titolare.csv) | Registro art. 30.1 dei trattamenti propri di Fide | Fide |

## Requisiti minimi per il pilota e stato nel software

| Requisito | Stato |
| --- | --- |
| Accordo art. 28 firmato con ogni cliente | Modello pronto |
| Registro dei trattamenti | Modelli pronti (CSV) |
| Server nell'UE | Database Supabase in regione UE (Irlanda). Sito e portale: Hetzner, Finlandia (UE) |
| Nessuna geolocalizzazione continua (art. 4 L. 300/1970) | QR come modalità predefinita; posizione disattivata per sede, letta una sola volta e mai inviata |
| Nessuna raccolta di dati biometrici, biometria non obbligatoria | Conferma locale del sistema operativo con PIN oppure impronta/Face ID se configurati; Fide riceve solo l’esito. [Decisione tecnica](../adr/0005-local-authentication.md) |
| Nessuna IA che decide sulle persone | Il servizio non contiene IA |
| Terminale chiosco in comodato d'uso, come prototipo | Clausola nell'accordo di pilota |
| Privacy policy dell'app e del sito | Sito: bozza in /privacy.html. App: da pubblicare prima degli store |
| Dati dell'impresa sul sito (P.IVA) | Da inserire all'apertura della P.IVA |
| Marchio «Fide» libero nelle classi 9 e 42 | Da verificare gratis su TMview prima di registrarlo |

Da verificare su un telefono reale del pilota: che lo sblocco con solo PIN, senza impronta registrata, funzioni anche
su Android per firmare e aprire i documenti.
