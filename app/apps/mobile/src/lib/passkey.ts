// Passkeys (FIDO2) to sign in to the app without an e-mail code: created once
// after the first sign-in, then used instead of the code. The private key stays
// in the phone's credential manager and is used after the normal screen unlock;
// Fide receives a signature, never biometric data. Supabase Auth runs the
// WebAuthn ceremony (RP ID fide-work.it); the phone side is react-native-passkey.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Passkey, type PasskeyCreateRequest, type PasskeyCreateResult, type PasskeyGetRequest, type PasskeyGetResult } from 'react-native-passkey';
import { supabase } from './supabase';

const FLAG = 'fide.passkey';

type Credential = Parameters<typeof supabase.auth.passkey.verifyRegistration>[0]['credential'];

/** The user closed the system sheet: nothing to show. */
export class PasskeyCancelled extends Error {}
/** No passkey for Fide on this phone (or synced to it): sign in with the e-mail code. */
export class NoPasskeyHere extends Error {}

export function passkeySupported(): boolean {
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}

/** Whether this phone already signed in with a passkey (it then becomes the main way in). */
export async function hasPasskeyHere(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FLAG)) === '1';
  } catch {
    return false;
  }
}

function rethrow(err: unknown): never {
  const code = (err as { error?: string } | null)?.error;
  if (code === 'UserCancelled') throw new PasskeyCancelled();
  if (code === 'NoCredentials') throw new NoPasskeyHere();
  throw err;
}

const asCredential = (r: PasskeyCreateResult | PasskeyGetResult) =>
  ({ ...r, rawId: r.rawId ?? r.id, type: 'public-key', clientExtensionResults: r.clientExtensionResults ?? {} }) as unknown as Credential;

/** Registers a passkey for the signed-in user. */
export async function registerPasskey(): Promise<void> {
  const { data, error } = await supabase.auth.passkey.startRegistration();
  if (error) throw error;
  let result: PasskeyCreateResult;
  try {
    result = await Passkey.create(data.options as unknown as PasskeyCreateRequest);
  } catch (err) {
    rethrow(err);
  }
  const verified = await supabase.auth.passkey.verifyRegistration({ challengeId: data.challenge_id, credential: asCredential(result) });
  if (verified.error) throw verified.error;
  await AsyncStorage.setItem(FLAG, '1');
}

/** Signs in with a passkey stored on (or synced to) this phone. */
export async function signInWithPasskey(): Promise<void> {
  const { data, error } = await supabase.auth.passkey.startAuthentication();
  if (error) throw error;
  let result: PasskeyGetResult;
  try {
    result = await Passkey.get(data.options as unknown as PasskeyGetRequest);
  } catch (err) {
    rethrow(err);
  }
  const verified = await supabase.auth.passkey.verifyAuthentication({ challengeId: data.challenge_id, credential: asCredential(result) });
  if (verified.error) throw verified.error;
  await AsyncStorage.setItem(FLAG, '1');
}
