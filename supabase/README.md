# Supabase: esquema v2

Migraciones en `migrations/` (aplicadas en orden), seed local en `seed.sql` y configuración del stack local en `config.toml`.

## Modelo de seguridad

- **anon no ve nada.** No hay ningún permiso sobre tablas ni funciones para la clave publicable; todo exige sesión.
- **Aislamiento por empresa y rol.** Cada tabla tiene RLS basada en la pertenencia activa a una empresa (`members.auth_user_id = auth.uid()` y `status = 'active'`). Los helpers de `private` (`my_member_ids`, `my_company_ids`, `my_hr_company_ids`, `my_managed_member_ids`) se usan como `x in (select private.fn())`.
- **Roles:** `employee` < `manager` (ve a su equipo, pero no su codice fiscale ni su email) < `hr_admin` < `company_owner`. Solo un owner da o quita poderes de HR u owner, y el último owner no se puede degradar.
- **Escrituras sensibles solo por RPC.** Las RPC son `SECURITY DEFINER` con `search_path = ''` y comprueban la autorización al principio. Los clientes solo tienen las columnas concedidas una a una: nadie puede cambiarse el rol, la empresa o el `auth_user_id` actualizando la tabla.
- **Funciones `svc_*`:** solo para el `service_role`, es decir, las Edge Functions.
- **Append-only:** `punches`, `key_events`, `document_access_events` y `audit_log`. Ni siquiera el service role puede reescribirlas.
- **Secretos fuera de la API:** el HMAC del kiosco (`private.kiosk_secrets`), la allowlist de altas y los hashes de los tokens de invitación.

## Tablas

| Área | Tablas |
|---|---|
| Empresa | `companies`, `sites` (geo desactivada por defecto), `members`, `member_identities` (CF y email), `invitations` |
| Dispositivos | `device_keys` (X25519 + Ed25519, huella generada), `key_events`, `kiosk_devices` |
| Presencias | `punches`, `punch_corrections` |
| Documentos | `payroll_batches`, `documents`, `document_key_wraps`, `document_access_events`; bucket `encrypted-documents` (solo `application/octet-stream`) |
| Ausencias | `leave_types` (FERIE, ROL, EXFEST, L104, MALATTIA, STRAORD), `leave_balances`, `leave_requests`, vista `leave_balance_summary` |
| Privacidad | `gdpr_requests`, `push_tokens`, `audit_log` (nombres de columnas, nunca valores) |

## Flujos

| Flujo | Llamadas |
|---|---|
| Alta de empresa | OTP → `register_company()` (durante el piloto, solo emails de `private.signup_allowlist`) |
| Alta de trabajador | `add_member()` → `create_invitation()` devuelve el token **una vez** → el trabajador entra por OTP con ese email → `redeem_invitation(token)` |
| Claves del móvil | `register_device_key()` revoca la anterior y deja el rastro en `key_events` |
| Kiosco | `create_kiosk()` devuelve un código de 8 caracteres (10 min) → la tablet llama a la Edge Function `kiosk-pair` → `svc_pair_kiosk()` devuelve el secreto una vez |
| Fichaje | la app firma el fichaje → la Edge Function `punch-sync` verifica la firma Ed25519 y el HMAC del QR → `svc_record_punch()`, idempotente y con flags |
| Nóminas | el navegador de HR cifra → `create_payroll_batch()` → sube cada objeto a `{company}/{member}/{doc}.bin` → `publish_payroll_batch()` comprueba que existen y tienen el tamaño declarado → el empleado usa `document-url` (`svc_document_download()`) → `mark_document_opened()` |
| Correcciones y ausencias | inserción del propio empleado (siempre `pending`) → `decide_*()` por su manager o HR, nunca por uno mismo |
| GDPR | `export_my_data()` (art. 15/20); inserción en `gdpr_requests` → `resolve_gdpr_request()` |

## Tests

`app/packages/db-tests` aplica `migrations/` y `seed.sql` sobre PGlite, que es Postgres en WASM, con un stub de lo que aporta Supabase (roles, `auth`, `storage` y los privilegios por defecto). Ejecuta 75 tests de RLS, permisos y RPC en unos 4 segundos, sin Docker:

```bash
cd app && npm test
```

En la CI, el job `db` aplica además las mismas migraciones sobre el stack real (`supabase start`), pasa `db lint` y genera `database.types.ts`.

## Desarrollo local

```bash
supabase start          # aplica migraciones + seed
supabase db reset       # vuelve a empezar
```

Los usuarios del seed están documentados en la cabecera de `seed.sql`. Todos entran por OTP; los códigos llegan a Inbucket (http://localhost:54324).

## Proyecto alojado (producción)

Proyecto `saehchpgnbcciqimrqsj`, región `eu-west-1` (Irlanda).

- **Migraciones.** La integración de Supabase con GitHub las aplica al mergear en `main` (check "Supabase Preview"
  sobre `main`). Una migración ya aplicada no se vuelve a ejecutar aunque cambie su contenido: para corregir algo,
  se añade una migración nueva.
- **Funciones y sus secretos.** Workflow manual **Supabase deploy** (`gh workflow run supabase-deploy.yml`). Lee
  los secretos y variables del entorno `production` de GitHub (la lista está en la cabecera del workflow) y los
  aplica con `supabase secrets set` antes de desplegar.
- **Auth.** El mismo workflow fija por la API de gestión la URL del portal, el código de 6 cifras, el SMTP de Brevo y
  las **passkeys**: `webauthn_rp_id = fide-work.it` (variable `FIDE_PASSKEY_RP_ID`; elegido una vez, porque cambiarlo
  invalida todas las passkeys) y como origen el portal (`FIDE_PASSKEY_ORIGINS`, separados por comas; el hash de la
  app Android se añade cuando exista la build). `config.toml` mantiene `localhost` para el desarrollo local.
- **Clave pública de los recibos de fichaje** (Ed25519, `raw`, base64). Sirve para verificar que un recibo lo
  firmó Fide sobre `"FIDE-RECEIPT-v1|<punch_id>|<sha256(signed_payload)>|<received_at>"`:

  ```
  B5QT8bCGgPRJqIvxIhyNTvMnyf2NmGITSgIYn3/ABeM=
  ```

  La privada solo existe como secreto `FIDE_RECEIPT_PRIVATE_KEY` del entorno `production` y de las funciones. Si
  se cambia, los recibos antiguos siguen siendo verificables solo con la clave pública antigua: guárdala aquí.
