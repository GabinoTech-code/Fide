import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL, configured } from './env';
import { encryptedSessionStorage } from './secureStorage';

export const supabase = createClient(configured ? SUPABASE_URL : 'http://supabase.invalid', configured ? SUPABASE_KEY : 'missing', {
  auth: {
    storage: encryptedSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Supabase Auth passkeys (beta): the two-step API in lib/passkey.ts.
    experimental: { passkey: true },
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export class FunctionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

/** POST to an Edge Function with the current session. Network failures throw TypeError. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new FunctionError(json.error ?? `http_${res.status}`, res.status);
  return json;
}
