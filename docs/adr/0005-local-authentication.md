# ADR 0005 — Conferma locale del sistema operativo

Data: 2026-10-10. Stato: accettata dal fondatore.

## Decisione

Conservare le passkey e la conferma locale prima di registrare le chiavi, firmare una timbratura o aprire un
documento. Il sistema operativo può utilizzare impronta/Face ID oppure il codice di sblocco del dispositivo.
Non richiedere l’attivazione della biometria e non raccogliere, trasmettere o conservare impronte o dati del volto.

La precedente espressione «sin biometría» era ambigua e non descriveva il codice: non autorizza a rimuovere
la conferma locale o a rendere accessibili le chiavi senza la protezione esistente.

## Implementazione e limiti

- `app/apps/mobile/src/lib/vault.ts`: `deviceLock()` accetta anche il livello PIN/sequenza;
  `unlock()` chiama `authenticateAsync()` e interrompe l’operazione se la verifica fallisce.
- Il risultato contiene successo o errore; non contiene impronte o immagini del volto.
- Le chiavi rimangono nel SecureStore; la verifica locale dell’app e la protezione dello storage sono controlli
  distinti. Questa decisione non dichiara che ogni lettura dello storage imponga una verifica biometrica hardware.
- Le passkey usano la verifica locale prevista dal sistema operativo. L’OTP via e-mail resta disponibile.
- Questa revisione modifica le descrizioni, non il comportamento nativo, i permessi, la conservazione o i dati
  inviati al server. La verifica su dispositivi reali Android e iOS, anche con solo PIN, resta necessaria per il pilota.

## Riferimento

[Expo LocalAuthentication per SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/), verificato il
2026-10-10 per la versione installata `~57.0.3`: `authenticateAsync`, `LocalAuthenticationResult`,
`disableDeviceFallback` (predefinito `false`) e `SecurityLevel.SECRET`.
