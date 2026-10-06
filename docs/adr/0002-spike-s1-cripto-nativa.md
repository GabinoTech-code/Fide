# ADR 0002 — Spike S1: libsodium y módulos nativos en Expo SDK 57

- **Estado:** Pendiente. Requiere una cuenta Expo/EAS y un móvil iOS y otro Android.

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

1. Añadir las dependencias con `npx expo install ...` en `app/apps/mobile`.
2. Ejecutar `eas build --profile development` para iOS y Android, e instalar la build en los móviles.
3. En una pantalla oculta de diagnóstico:
   - generar un par Ed25519 con una semilla fija;
   - firmar `"FIDE-PUNCH-v1\n{...}"` y comparar la firma en hex con la que da `libsodium-wrappers` en Node para la misma semilla;
   - hacer el round-trip `crypto_box_seal` / `crypto_box_seal_open` y XChaCha20-Poly1305;
   - guardar y leer la clave privada en SecureStore con `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, detrás de `LocalAuthentication.authenticateAsync()`.

## Criterio go/no-go

- **Go:** firmas idénticas, round-trips correctos y sin crashes al arrancar en ninguna de las dos plataformas.
- **No-go:** se pasa a `@noble/curves` + `@noble/ciphers` + `@noble/hashes` (JS puro) detrás de la misma interfaz de `@fide/crypto`, validada con los mismos vectores.

## Resultado

_(pendiente)_
