// Device keys: generated on this phone, private halves in SecureStore (this
// device only, never backed up or synced), public halves registered with
// register_device_key(). Signing and decrypting require unlocking the phone
// (expo-local-authentication), checked at each use. Any screen lock qualifies
// (deviceLock accepts SecurityLevel.SECRET, i.e. PIN or pattern): biometrics are
// never required, and the OS does the check, so no biometric data reaches Fide.
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { generateDeviceKeys, keyFingerprint, type DeviceKeys } from '@fide/crypto';
import { getSodium } from './sodium';
import { supabase } from './supabase';

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export interface StoredKeys extends DeviceKeys {
  deviceKeyId: string;
  memberId: string;
  companyId: string;
  fingerprint: string;
}

const slot = (memberId: string) => `fide.device.${memberId}`;

export async function loadKeys(memberId: string): Promise<StoredKeys | null> {
  const raw = await SecureStore.getItemAsync(slot(memberId), OPTIONS);
  return raw ? (JSON.parse(raw) as StoredKeys) : null;
}

export type DeviceLock = 'ok' | 'no_lock';

/** The phone must have a screen lock: without it the keys would be unprotected. */
export async function deviceLock(): Promise<DeviceLock> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level === LocalAuthentication.SecurityLevel.NONE ? 'no_lock' : 'ok';
}

export class LockedError extends Error {
  constructor(readonly reason: string) {
    super(`unlock failed: ${reason}`);
  }
}

/** Biometrics, or the device PIN as fallback. */
export async function unlock(promptMessage: string, fallbackLabel: string): Promise<void> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, fallbackLabel });
  if (!result.success) throw new LockedError(result.error);
}

/**
 * Creates and registers new keys for this membership (first sign-in or new
 * phone). The server revokes the previous key and HR sees the change.
 */
export async function enrolDevice(memberId: string, companyId: string, deviceLabel: string): Promise<StoredKeys> {
  const sodium = await getSodium();
  const keys = generateDeviceKeys(sodium);
  const { data, error } = await supabase.rpc('register_device_key', {
    p_company_id: companyId,
    p_x25519_public_key: keys.x25519PublicKey,
    p_ed25519_public_key: keys.ed25519PublicKey,
    p_device_label: deviceLabel,
  });
  if (error) throw error;
  const stored: StoredKeys = {
    ...keys,
    deviceKeyId: data as string,
    memberId,
    companyId,
    fingerprint: keyFingerprint(keys.x25519PublicKey, keys.ed25519PublicKey),
  };
  await SecureStore.setItemAsync(slot(memberId), JSON.stringify(stored), OPTIONS);
  return stored;
}

/** Whether the server still considers this phone's key the active one. */
export async function keyIsActive(keys: StoredKeys): Promise<boolean> {
  const { data, error } = await supabase.from('device_keys').select('status').eq('id', keys.deviceKeyId).maybeSingle();
  if (error) throw error;
  return data?.status === 'active';
}

export async function forgetKeys(memberId: string): Promise<void> {
  await SecureStore.deleteItemAsync(slot(memberId), OPTIONS);
}
