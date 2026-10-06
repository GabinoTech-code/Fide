# ADR 0003 — Spike S2: passkeys en la app móvil

- **Estado:** Pendiente. Requiere el dominio definitivo, cuenta de Apple Developer (organización) y una dev build.

## Contexto

Supabase Auth tiene passkeys nativas en beta: `auth.experimental.passkey`, `registerPasskey()` y `signInWithPasskey()`. En la web usa `navigator.credentials`. La documentación cubre Swift y Flutter, pero **no React Native**.

Docs: https://supabase.com/docs/guides/auth/passkeys

## Prerrequisitos

- **RP ID:** `fide-work.it`. Se decide una sola vez, porque cambiarlo invalida todas las passkeys.
- **Ficheros en el dominio:**
  - `https://<rp_id>/.well-known/apple-app-site-association` con `webcredentials` → `<TEAMID>.it.fidework.app`.
  - `https://<rp_id>/.well-known/assetlinks.json` con `delegate_permission/common.get_login_creds`.
- **`app.json`:** `ios.associatedDomains: ["webcredentials:<rp_id>"]`, más los `intentFilters` de Android.
- **`[auth.webauthn].rp_origins`:** incluir `android:apk-key-hash:<sha256 base64url del certificado>`.

## Procedimiento

1. Sesión por OTP de email en la app.
2. Con `react-native-passkeys`, pedir el challenge de registro a los endpoints de passkeys de GoTrue, crear la credencial y enviar la respuesta. Hay que ver qué expone supabase-js o llamar a la REST directamente.
3. Cerrar sesión e iniciar con la passkey de forma discoverable.
4. Repetirlo en iOS (iCloud Keychain) y Android (Google Password Manager).

## Criterio go/no-go

- **Go:** registro y login funcionan en las dos plataformas con una sesión válida de Supabase.
- **No-go:** para el piloto, el móvil usa OTP + clave de dispositivo + biometría local (posesión + verificación del usuario), y las passkeys quedan solo en el portal. Se reintenta cuando Supabase documente RN o pase a GA.

## Resultado

_(pendiente)_
