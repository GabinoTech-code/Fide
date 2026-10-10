# Fide

App HR per le PMI italiane: **timbratura con QR del chiosco**, **cedolini cifrati end-to-end** che si aprono solo sul
telefono del dipendente, ferie e permessi. In **fase pilota**.

## Come protegge i dati (e cosa non fa)

- **Timbrature firmate sul telefono** (Ed25519) e controfirmate dal server, anche senza rete: si mettono in coda e
  si sincronizzano con ricevuta. Il database non permette di modificarle; le correzioni sono richieste approvate.
- **QR del chiosco** che cambia ogni 30 secondi (HMAC-SHA256) e vale una sola volta.
- **Posizione solo se la sede la attiva** (art. 4 L. 300/1970): il telefono calcola «dentro/fuori» con una sola
  lettura e invia solo l'esito (più l'indicazione «posizione simulata» se il sistema la segnala), mai le coordinate.
- **Cedolini cifrati nel browser dell'HR** (XChaCha20-Poly1305, chiave sigillata con X25519 per il telefono del
  dipendente); il server vede solo file cifrati. Il portale verifica il codice di sicurezza delle chiavi prima di
  cifrare. Il dipendente li apre o ne salva una copia nel telefono: la copia salvata è sua e non è più cifrata.
- **Nessuna password**: codice via e-mail e passkey. **Nessuna raccolta di dati biometrici**: conferma locale del
  sistema operativo con PIN oppure impronta/Face ID se configurati, senza obbligo di attivare la biometria.
  [Dettagli e limiti](docs/adr/0005-local-authentication.md).
- **Isolamento tra aziende** con Row Level Security, verificato da test automatici.
- **Saldi ferie e permessi**: HR carica accreditato, riporto e utilizzato fuori Fide; il lavoratore vede il disponibile
  e le richieste pendenti. La maturazione contrattuale non viene calcolata automaticamente.
- **Nessuna IA** e nessuna decisione automatizzata sulle persone.

Limiti attuali e controlli effettivi: [docs/security/AUDIT-2026-10-07.md](docs/security/AUDIT-2026-10-07.md).

Confronto funzionale e piano di costruzione aggiornato: [comparativa del 10 ottobre](docs/audit/COMPARATIVA-Y-PLAN-2026-10-10.md).

## Struttura

| Percorso | Contenuto |
| --- | --- |
| `app/apps/mobile` | App per i dipendenti (Expo SDK 57, expo-router), 9 lingue |
| `app/apps/web-portal` | Portale HR e pagina chiosco (Vite + React) |
| `app/apps/site` | Sito pubblico fide-work.it e pagina degli inviti |
| `app/packages/shared` | Protocolli condivisi, validazioni italiane (codice fiscale, P.IVA), marchio, intestazioni di sicurezza |
| `app/packages/crypto` | Firme, cifratura dei documenti e vettori di prova comuni a telefono, browser e server |
| `app/packages/payroll-parser` | Divisione dei PDF cumulativi dei cedolini per codice fiscale |
| `app/packages/db-tests` | Test di RLS e funzioni del database (PGlite) |
| `supabase/` | Migrazioni, funzioni Edge (Deno), configurazione |
| `deploy/` | Pubblicazione di sito e portale sul server (nginx generato da `@fide/shared`) |
| `docs/` | Architettura, decisioni (ADR), sicurezza, audit, [documenti legali](docs/legal/README.md) |
| `prototype/` | Mockup di design (riferimento visivo, non codice di prodotto) |
| `hardware/` | Progetto fisico del terminale di timbratura |
| `_scratch/` | File temporanei, ignorati da git |

Regole del progetto (rami, sicurezza, struttura, documentazione): [CLAUDE.md](CLAUDE.md). Segnalazioni di sicurezza:
[SECURITY.md](SECURITY.md).

## Sviluppo

```bash
cd app
npm ci
npm run typecheck && npm run lint && npm test
```

- Portale: `npm run dev --workspace apps/web-portal` (serve `apps/web-portal/.env`, vedi `.env.example`).
- Sito: `npm run dev --workspace apps/site`.
- App: `cd apps/mobile && npx expo start --dev-client` con una development build (EAS).
  Le build EAS leggono `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` dalle variabili d'ambiente EAS del
  progetto (ambienti `development`, `preview`, `production`, scelti in `eas.json`), non da `.env`, che non è nel repository.

Le migrazioni si applicano al progetto ospitato con il workflow manuale **Supabase deploy** (`.github/workflows/supabase-deploy.yml`).
Dettagli in [supabase/README.md](supabase/README.md) e [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
