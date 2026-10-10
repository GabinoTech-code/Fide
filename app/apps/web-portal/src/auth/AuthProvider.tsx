import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Membership } from '../lib/types';

const ACTIVE_KEY = 'fide.portal.company';

interface Auth {
  session: Session | null;
  /** undefined while the first session check is running */
  ready: boolean;
  memberships: Membership[];
  membershipsLoading: boolean;
  /** The selected company membership (HR/owner ones first). */
  active: Membership | null;
  isHr: boolean;
  /** A team manager (capo turno): presence and requests of their own team only. */
  isManager: boolean;
  setActiveCompany(companyId: string): void;
  refreshMemberships(): Promise<unknown>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id;
  const membershipsQuery = useQuery({
    queryKey: ['memberships', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('id, company_id, role, status, full_name, companies(legal_name)')
        .eq('auth_user_id', userId!)
        .eq('status', 'active');
      if (error) throw error;
      return data as unknown as Membership[];
    },
  });

  const memberships = useMemo(() => membershipsQuery.data ?? [], [membershipsQuery.data]);
  const active = useMemo(() => {
    const rank = (r: Membership['role']) => (isHrRole(r) ? 2 : r === 'manager' ? 1 : 0);
    const ranked = [...memberships].sort((a, b) => rank(b.role) - rank(a.role));
    return ranked.find((m) => m.company_id === activeId) ?? ranked[0] ?? null;
  }, [memberships, activeId]);

  const setActiveCompany = useCallback((companyId: string) => {
    setActiveId(companyId);
    try {
      localStorage.setItem(ACTIVE_KEY, companyId);
    } catch {
      // not persisted
    }
  }, []);

  const value: Auth = {
    session,
    ready,
    memberships,
    membershipsLoading: membershipsQuery.isLoading,
    active,
    isHr: active ? isHrRole(active.role) : false,
    isManager: active?.role === 'manager',
    setActiveCompany,
    refreshMemberships: () => membershipsQuery.refetch(),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function isHrRole(role: Membership['role']): boolean {
  return role === 'hr_admin' || role === 'company_owner';
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
