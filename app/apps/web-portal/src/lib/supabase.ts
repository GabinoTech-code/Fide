import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);
export const supabaseUrl = url ?? '';

export const supabase = createClient(url || 'http://supabase.invalid', key || 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Supabase Auth passkeys (beta): registerPasskey / signInWithPasskey.
    experimental: { passkey: true },
  },
});

/** Calls an Edge Function with the current session. */
export async function callFunction<T>(name: string, body: Record<string, unknown>, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: key ?? '' };
  if (opts.auth !== false) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error ?? `http_${res.status}`);
  return json;
}
