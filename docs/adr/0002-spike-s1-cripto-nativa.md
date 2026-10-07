# ADR 0002 — Spike S1: libsodium y módulos nativos en Expo SDK 57

- **Estado:** Android: **Go** (2026-10-07, emulador). iOS: pendiente.

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

**Android (2026-10-07).** Dev build EAS `development` (keystore remoto de EAS, SHA-256 `3E:A8:F1:…:29:78`) en un emulador Android 15 `google_apis` x86_64, con huella registrada. La app arranca sin crashes con todos los módulos nativos.

| Comprobación | Resultado |
|---|---|
| Claves Ed25519 y X25519 desde semilla | OK, idénticas a Node |
| Firma Ed25519 del fichaje de ejemplo | OK, byte a byte igual que libsodium-wrappers |
| Huella SHA-256 (`@noble/hashes` en Hermes) | OK |
| Vector XChaCha20-Poly1305 con dato asociado | OK, tras el cambio de abajo |
| Descifrado con el dato asociado correcto, y rechazo del incorrecto | OK |
| Apertura de un sealed box creado en Node | OK |
| Ida y vuelta `fide-doc-v1` con claves nuevas | OK |
| SecureStore `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | OK |
| Hardware biométrico | OK, nivel 3 (fuerte) |
| Aviso biométrico (huella o PIN) | OK |
| SQLite (cola offline) | OK |
| Ubicación en primer plano con `Accuracy.High` | OK, ±5 m, `mocked=false` |
| Token de push de Expo | **KO esperado**: falta configurar Firebase (FCM) |
| Escaneo de QR | Pendiente, en un móvil real |

**Hallazgos**
1. `react-native-libsodium` solo acepta el dato asociado del AEAD como **string**: con `Uint8Array` lanza "input type not yet implemented", y tampoco acepta `null`.
   - `@fide/crypto` pasa ahora el string `fide-doc-v1|<doc>|<miembro>`, que es ASCII; libsodium-wrappers lo codifica en UTF-8, así que los bytes son idénticos en las dos plataformas.
   - La primera versión de la prueba de rechazo daba un falso positivo, porque fallaba por el tipo y no por la autenticación. Ahora exige antes que el descifrado correcto funcione.
2. Con `Accuracy.Balanced`, Android usa la ubicación por red. Para fichar se usa `High`, es decir, GPS.
3. Push en Android necesita un proyecto Firebase:
   - `google-services.json` en `android.googleServicesFile`;
   - la clave de cuenta de servicio FCM v1 subida a EAS (`eas credentials`).

**Decisión:** se mantiene `react-native-libsodium`; no hace falta el plan B con `@noble`. Queda por repetir en iOS y por probar el QR en un móvil real.
