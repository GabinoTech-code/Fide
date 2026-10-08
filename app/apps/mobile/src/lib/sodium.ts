import rnSodium from 'react-native-libsodium';
import type { SelfTestSodium } from '@fide/crypto';

export interface AppSodium extends SelfTestSodium {
  crypto_secretbox_easy(message: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
  crypto_secretbox_open_easy(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
}

/** react-native-libsodium (JSI). Verified against libsodium-wrappers vectors (docs/adr/0002). */
export async function getSodium(): Promise<AppSodium> {
  await rnSodium.ready;
  return rnSodium as unknown as AppSodium;
}
