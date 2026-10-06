# ADR 0001 — Alcance del piloto y stack

- **Estado:** Aceptada (2026-10-06)

## Contexto

La auditoría de octubre de 2026 mostró que Fide era una demo: login, firmas, geovalla, sincronización y cifrado estaban simulados, y las políticas RLS de Supabase dejaban todos los datos abiertos a la clave pública.

## Decisión

1. **Objetivo:** piloto real con **una empresa italiana**. España queda para después.
2. **Backend:** Supabase en la UE, en un **proyecto nuevo**. El proyecto `saehchpgnbcciqimrqsj` se considera expuesto y se vaciará. No hay API Node propia: la lógica de servidor va en Edge Functions (Deno) y RPC de Postgres.
3. **Auth:** passkeys FIDO2 (Supabase Auth nativo, beta) como método principal, y **OTP por email como fallback y recuperación**. Una passkey solo se puede registrar con una sesión ya abierta, así que el primer acceso siempre es por OTP.
4. **Portal:** Vite + React + TypeScript (sustituye a `apps/web-portal/legacy/index.html`).
5. **Móvil:** Expo SDK 57 con expo-router y una dev build. Las claves X25519 y Ed25519 se generan en el dispositivo y se guardan en expo-secure-store (el Secure Enclave solo admite P-256).
6. **Cifrado de nóminas:** se cifran en el navegador de HR. Ninguna función del servidor ve el PDF en claro.
7. **Fichaje:** primero por QR. La geovalla se desactiva por sede hasta tener el dictamen legal (art. 4 L. 300/1970).
8. **Dominio e identificadores:** `fide-work.it` (también tenéis `fide-work.online`). Será el RP ID de las passkeys, con el portal en `app.fide-work.it`. El identificador de la app es `it.fidework.app` en iOS y Android: Android no admite guiones.
9. **Fuera del MVP:** NFC, asistente IA, push cifrado, firma del emisor en nóminas, re-wrap de claves entre dispositivos y SSO/SCIM.

## Consecuencias

- Se ha borrado `apps/api` (stub con mapas en memoria y un `schema.sql` que no coincidía con la migración).
- El esquema v1 se sustituye por migraciones v2 con RLS por empresa y rol, con tests pgTAP.
- Cambiar de móvil implica claves nuevas, y HR tiene que reemitir las nóminas anteriores.
