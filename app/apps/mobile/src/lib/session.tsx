// Who is signed in, which company membership is active, and whether this phone
// holds that membership's active device key. Screens derive their route from it.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { signInWithPasskey as passkeySignIn } from './passkey';
import { supabase } from './supabase';
import { keyIsActive, loadKeys, type StoredKeys } from './vault';

export interface Membership {
  id: string;
  company_id: string;
  role: 'employee' | 'manager' | 'hr_admin' | 'company_owner';
  full_name: string;
  site_id: string | null;
  preferred_language: string;
  /** 'terminated': employment ended; read-only access to own documents for 12 months (RLS). */
  status: 'active' | 'terminated';
  terminated_on: string | null;
  companies: { legal_name: string } | null;
}

/** 'missing': no key on this phone; 'replaced': the server revoked it (another phone enrolled). */
export type KeyState = 'unknown' | 'ok' | 'missing' | 'replaced';

interface SessionValue {
  ready: boolean;
  session: Session | null;
  memberships: Membership[];
  membership: Membership | null;
  keys: StoredKeys | null;
  keyState: KeyState;
  pendingInvite: string | null;
  setPendingInvite(token: string | null): Promise<void>;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  /** Signs in with this phone's passkey, then loads everything like verifyCode. */
  signInWithPasskey(): Promise<void>;
  refresh(): Promise<void>;
  setKeys(keys: StoredKeys): void;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
const INVITE_SLOT = 'fide.pendingInvite';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [keys, setKeysState] = useState<StoredKeys | null>(null);
  const [keyState, setKeyState] = useState<KeyState>('unknown');
  const [pendingInvite, setPendingInviteState] = useState<string | null>(null);

  const membership = memberships[0] ?? null;

  const loadMemberships = useCallback(async (s: Session | null) => {
    if (!s) {
      setMemberships([]);
      return [];
    }
    const { data, error } = await supabase
      .from('members')
      .select('id, company_id, role, full_name, site_id, preferred_language, status, terminated_on, companies(legal_name)')
      .eq('auth_user_id', s.user.id)
      .in('status', ['active', 'terminated']);
    if (error) throw error;
    // RLS returns a terminated membership only during its 12-month window. Active ones come first.
    const list = ((data ?? []) as unknown as Membership[]).sort(
      (a, b) => Number(b.status === 'active') - Number(a.status === 'active'),
    );
    setMemberships(list);
    return list;
  }, []);

  const loadKeyState = useCallback(async (m: Membership | null) => {
    if (!m) {
      setKeysState(null);
      setKeyState('unknown');
      return;
    }
    const stored = await loadKeys(m.id);
    setKeysState(stored);
    if (!stored) return setKeyState('missing');
    try {
      setKeyState((await keyIsActive(stored)) ? 'ok' : 'replaced');
    } catch {
      // Offline: trust the local key; punch-sync will refuse it if it was revoked.
      setKeyState('ok');
    }
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    try {
      const list = await loadMemberships(data.session);
      await loadKeyState(list[0] ?? null);
    } catch {
      // Network errors leave the previous state; screens show their own errors.
    }
  }, [loadKeyState, loadMemberships]);

  useEffect(() => {
    (async () => {
      setPendingInviteState(await SecureStore.getItemAsync(INVITE_SLOT));
      await refresh();
      setReady(true);
    })();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      session,
      memberships,
      membership,
      keys,
      keyState,
      pendingInvite,
      async setPendingInvite(token) {
        if (token) await SecureStore.setItemAsync(INVITE_SLOT, token);
        else await SecureStore.deleteItemAsync(INVITE_SLOT);
        setPendingInviteState(token);
      },
      async sendCode(email) {
        const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
        if (error) throw error;
      },
      async verifyCode(email, code) {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
        if (error) throw error;
        // Load session, memberships and keys before the caller navigates: the
        // SIGNED_IN listener refreshes asynchronously, and the entry gate would
        // otherwise still see no session and send the user back to the login.
        await refresh();
      },
      async signInWithPasskey() {
        await passkeySignIn();
        await refresh();
      },
      refresh,
      setKeys(next) {
        setKeysState(next);
        setKeyState('ok');
      },
      async signOut() {
        await supabase.auth.signOut();
        setMemberships([]);
        setKeysState(null);
        setKeyState('unknown');
      },
    }),
    [ready, session, memberships, membership, keys, keyState, pendingInvite, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
