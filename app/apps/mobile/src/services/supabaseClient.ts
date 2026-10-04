import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PunchRecord, DocumentItem } from '../types';

// Supabase configuration with environment variables or fallback placeholders
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fide-security-eu.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fide_public_anon_placeholder';

export const isSupabaseConfigured = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

// Instantiate Supabase client with auth persistence configured
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const SupabaseSyncService = {
  // Syncs offline queued punches to Supabase attendance_punches table
  async syncOfflinePunches(
    userId: string,
    punches: PunchRecord[]
  ): Promise<{ syncedCount: number; errors: any[] }> {
    if (!isSupabaseConfigured) {
      // Local development or offline mode fallback
      return { syncedCount: punches.length, errors: [] };
    }

    const payload = punches.map((p) => ({
      user_id: userId,
      timestamp_epoch: p.timestamp,
      punch_type: p.type,
      verification_method: p.methodKey,
      in_geofence: true,
      device_signature: p.signature,
      queue_id: p.queueId || `queue_${p.timestamp}`,
      receipt_code: `REC-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    }));

    const { data, error } = await supabase.from('attendance_punches').insert(payload).select();

    if (error) {
      console.warn('[Supabase] Punch sync error:', error.message);
      return { syncedCount: 0, errors: [error] };
    }

    return { syncedCount: data?.length || payload.length, errors: [] };
  },

  // Registers the employee's public keys in Supabase (X25519 & Ed25519)
  async registerPublicKeys(
    userId: string,
    x25519PublicKey: string,
    ed25519PublicKey: string
  ): Promise<boolean> {
    if (!isSupabaseConfigured) return true;

    const { error } = await supabase.from('user_public_keys').upsert({
      user_id: userId,
      x25519_public_key: x25519PublicKey,
      ed25519_public_key: ed25519PublicKey,
      algorithm: 'X25519 + Ed25519 (libsodium)',
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('[Supabase] Public key registration error:', error.message);
      return false;
    }

    return true;
  },

  // Subscribe to Realtime notifications for new encrypted documents
  subscribeToDocumentNotifications(userId: string, onNewDocument: (doc: any) => void) {
    if (!isSupabaseConfigured) return () => {};

    const channel = supabase
      .channel(`user-docs-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'encrypted_documents',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onNewDocument(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
