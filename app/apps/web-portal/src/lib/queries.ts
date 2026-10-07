// Data access for the active company. RLS enforces the same scoping server-side;
// the company filter here only keeps multi-company users' views separate.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from './supabase';
import type { AuditEntry, Kiosk, LeaveRequest, Member, PayrollBatch, Punch, PunchCorrection, Site } from './types';

function useCompanyId(): string {
  const { active } = useAuth();
  return active?.company_id ?? '';
}

async function rows<T>(promise: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await promise;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useMembers() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['members', companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      rows<Member>(
        supabase
          .from('members')
          .select(
            'id, company_id, auth_user_id, role, status, full_name, site_id, manager_member_id, employee_number, member_identities(email, codice_fiscale), device_keys(id, status, fingerprint, x25519_public_key, ed25519_public_key, created_at)',
          )
          .eq('company_id', companyId)
          .order('full_name'),
      ),
  });
}

export function useSites() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['sites', companyId],
    enabled: Boolean(companyId),
    queryFn: () => rows<Site>(supabase.from('sites').select('*').eq('company_id', companyId).order('name')),
  });
}

export function useKiosks() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['kiosks', companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      rows<Kiosk>(supabase.from('kiosk_devices').select('id, site_id, name, status, paired_at').eq('company_id', companyId).order('created_at')),
  });
}

/** Today's punches (Europe/Rome), kept live through Realtime. */
export function useTodayPunches() {
  const companyId = useCompanyId();
  const queryClient = useQueryClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.toISOString();

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`punches:${companyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'punches', filter: `company_id=eq.${companyId}` }, () =>
        queryClient.invalidateQueries({ queryKey: ['punches', companyId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);

  return useQuery({
    queryKey: ['punches', companyId, since.slice(0, 10)],
    enabled: Boolean(companyId),
    queryFn: () =>
      rows<Punch>(
        supabase
          .from('punches')
          .select('id, member_id, punch_type, method, site_id, device_ts, received_at, receipt_code, flags')
          .eq('company_id', companyId)
          .gte('device_ts', since)
          .order('device_ts', { ascending: false }),
      ),
  });
}

export function usePendingLeave() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['leave', companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      rows<LeaveRequest>(
        supabase
          .from('leave_requests')
          .select('id, member_id, start_date, end_date, quantity, note, status, leave_types(code, name, unit)')
          .eq('company_id', companyId)
          .eq('status', 'pending')
          .order('start_date'),
      ),
  });
}

export function usePendingCorrections() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['corrections', companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      rows<PunchCorrection>(
        supabase
          .from('punch_corrections')
          .select('id, member_id, punch_type, requested_ts, reason, status')
          .eq('company_id', companyId)
          .eq('status', 'pending')
          .order('requested_ts'),
      ),
  });
}

export function useAuditLog() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['audit', companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      rows<AuditEntry>(
        supabase
          .from('audit_log')
          .select('id, table_name, row_id, operation, changed_columns, actor_auth_user_id, created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(200),
      ),
  });
}

/** Recent batches with their documents' delivery state (two queries: no reliance on composite-FK embedding). */
export function usePayrollBatches() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['payroll', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const batches = await rows<Omit<PayrollBatch, 'documents'>>(
        supabase
          .from('payroll_batches')
          .select('id, kind, period, title, status, created_at, published_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(24),
      );
      if (!batches.length) return [];
      const docs = await rows<{ id: string; batch_id: string; status: string; first_opened_at: string | null }>(
        supabase
          .from('documents')
          .select('id, batch_id, status, first_opened_at')
          .in(
            'batch_id',
            batches.map((b) => b.id),
          ),
      );
      return batches.map((b): PayrollBatch => ({ ...b, documents: docs.filter((d) => d.batch_id === b.id) }));
    },
  });
}

/** member id → full name, for tables that only carry member_id. */
export function useMemberNames(): Map<string, string> {
  const { data } = useMembers();
  return new Map((data ?? []).map((m) => [m.id, m.full_name]));
}
