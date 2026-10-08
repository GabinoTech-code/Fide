// Storage adapter for the Supabase session. SecureStore can reject values over
// ~2 KB, and a session (tokens + user) is larger, so the session is encrypted
// with a random key that lives in SecureStore (Keychain / Android Keystore) and
// the ciphertext goes to AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fromBase64, toBase64 } from '@fide/shared';
import { getSodium } from './sodium';

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
// SecureStore keys allow only [A-Za-z0-9._-].
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function keyFor(name: string, create: boolean): Promise<Uint8Array | null> {
  const id = `fide.sk.${safe(name)}`;
  const existing = await SecureStore.getItemAsync(id, OPTIONS);
  if (existing) return fromBase64(existing);
  if (!create) return null;
  const sodium = await getSodium();
  const key = sodium.randombytes_buf(32);
  await SecureStore.setItemAsync(id, toBase64(key), OPTIONS);
  return key;
}

export const encryptedSessionStorage = {
  async getItem(name: string): Promise<string | null> {
    const blob = await AsyncStorage.getItem(`fide.enc.${name}`);
    if (!blob) return null;
    const key = await keyFor(name, false);
    if (!key) return null;
    try {
      const sodium = await getSodium();
      const raw = fromBase64(blob);
      const plain = sodium.crypto_secretbox_open_easy(raw.subarray(24), raw.subarray(0, 24), key);
      return new TextDecoder().decode(plain);
    } catch {
      // Key changed or data corrupted: behave as signed out.
      await AsyncStorage.removeItem(`fide.enc.${name}`);
      return null;
    }
  },

  async setItem(name: string, value: string): Promise<void> {
    const sodium = await getSodium();
    const key = (await keyFor(name, true))!;
    const nonce = sodium.randombytes_buf(24);
    const ct = sodium.crypto_secretbox_easy(new TextEncoder().encode(value), nonce, key);
    const out = new Uint8Array(nonce.length + ct.length);
    out.set(nonce);
    out.set(ct, nonce.length);
    await AsyncStorage.setItem(`fide.enc.${name}`, toBase64(out));
  },

  async removeItem(name: string): Promise<void> {
    await AsyncStorage.removeItem(`fide.enc.${name}`);
    await SecureStore.deleteItemAsync(`fide.sk.${safe(name)}`, OPTIONS);
  },
};
