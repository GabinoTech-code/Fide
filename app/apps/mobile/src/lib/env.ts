// Public configuration (EXPO_PUBLIC_* is inlined into the bundle: never put secrets here).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const configured = /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_KEY.length > 20;
