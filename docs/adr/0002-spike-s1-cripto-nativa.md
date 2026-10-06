# ADR 0002 — Spike S1: libsodium y módulos nativos en Expo SDK 57

- **Estado:** Preparado (2026-10-06), pendiente de ejecutar en los dispositivos. Cuenta Expo existente; cuentas Apple Developer y Google Play disponibles.

## Pregunta

¿Funcionan juntos en una dev build (SDK 57, RN 0.86, nueva arquitectura)?

- `react-native-libsodium`
- `expo-secure-store`
- `expo-local-authentication`
- `expo-camera`
- `expo-location`
- `expo-notifications`
- `expo-sqlite`

## Procedimiento

La app ya incluye las dependencias (`expo-dev-client`, `expo-secure-store`, `expo-local-authentication`, `expo-camera`, `expo-location`, `expo-notifications`, `expo-sqlite`, `react-native-libsodium`) y una pantalla de diagnóstico (`src/components/modals/DiagnosticsModal.tsx`).

```bash
cd app/apps/mobile
npx eas-cli@latest init                                    # vincula el proyecto a la cuenta Expo (projectId)
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest device:create                           # registra el iPhone para distribución interna
npx eas-cli@latest build --profile development --platform ios   # pide tu login de Apple
npx expo start --dev-client
```

En la app, **mantén pulsado el título de la cabecera** (1,2 s) para abrir *Diagnostica dispositivo*:

1. Se ejecutan solas las comprobaciones de `runCryptoSelfTest()` (`@fide/crypto`):
   - claves desde semilla;
   - firma Ed25519 del fichaje de ejemplo, que tiene que ser exactamente `Znl2cjw9TbXt9G+Lzw1WMnc3pL2pl6xCYa8lJ33c+xaFue6N2LjYeZbWsOKtlANins+HtpF87395itE6xPngCA==`;
   - huella SHA-256;
   - vector XChaCha20-Poly1305 con dato asociado;
   - apertura de un sealed box creado en Node;
   - ida y vuelta de `fide-doc-v1`.

   Son los mismos vectores que pasa el test de Node con libsodium-wrappers.
2. También se ejecutan solas SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), el hardware biométrico y SQLite.
3. Los botones ejecutan las pruebas interactivas: **Biometria** (prompt con PIN de respaldo), **Posizione** (una lectura en primer plano; solo muestra la precisión), **Push** (token de Expo) y **QR** (escanear un código).
4. **Condividi** genera el informe en texto: pégalo en *Resultado*.

## Criterio go/no-go

- **Go:** firmas idénticas, round-trips correctos y sin crashes al arrancar en ninguna de las dos plataformas.
- **No-go:** se pasa a `@noble/curves` + `@noble/ciphers` + `@noble/hashes` (JS puro) detrás de la misma interfaz de `@fide/crypto`, validada con los mismos vectores.

## Resultado

_(pendiente)_
