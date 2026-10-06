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
   - generar un par Ed25519 con `crypto_sign_seed_keypair(32 bytes a 0x02)`;
   - firmar con `signPunch()` de `@fide/crypto` el fichaje de ejemplo de `app/packages/crypto/src/crypto.test.ts`. Ed25519 es determinista, así que la firma tiene que ser exactamente:
     `Znl2cjw9TbXt9G+Lzw1WMnc3pL2pl6xCYa8lJ33c+xaFue6N2LjYeZbWsOKtlANins+HtpF87395itE6xPngCA==`
     (es el snapshot de `crypto.test.ts`; la verifica también WebCrypto, que es lo que usa `punch-sync` en Deno);
   - hacer el round-trip `crypto_box_seal` / `crypto_box_seal_open` y XChaCha20-Poly1305;
   - guardar y leer la clave privada en SecureStore con `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, detrás de `LocalAuthentication.authenticateAsync()`.

## Criterio go/no-go

- **Go:** firmas idénticas, round-trips correctos y sin crashes al arrancar en ninguna de las dos plataformas.
- **No-go:** se pasa a `@noble/curves` + `@noble/ciphers` + `@noble/hashes` (JS puro) detrás de la misma interfaz de `@fide/crypto`, validada con los mismos vectores.

## Resultado

_(pendiente)_
