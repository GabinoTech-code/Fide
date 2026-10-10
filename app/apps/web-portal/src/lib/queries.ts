// Data access for the active company. RLS enforces the same scoping server-side;
// the company filter here only keeps multi-company users' views separate.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import type { AuditMember } from './auditAttribution';
import { supabase } from './supabase';
import { romeDate } from '@fide/shared';
import { collectById, presenceWindow } from './presenceView';
import type { AuditEntry, BatchDocument, GdprRequest, Kiosk, LeaveRequest, LeaveType, Member, PayrollBatch, Punch, PunchCorrection, Site } from './types';

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
    queryFn: async () => {
      const members = await collectById<Member>((after) => {
        let query = supabase
          .from('members')
          .select(
            'id, company_id, auth_user_id, role, status, full_name, site_id, manager_member_id, employee_number, preferred_language, terminated_on, status_changed_at, member_identities(email, codice_fiscale), device_keys(id, status, fingerprint, x25519_public_key, ed25519_public_key, created_at)',
          )
          .eq('company_id', companyId)
          .order('id').limit(500);
        if (after) query = query.gt('id', after);
        return query.overrideTypes<Member[], { merge: false }>();
      });
      return members.sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });
}

/** Minimal same-company identity data used only to label audit events. */
export function useAuditAttributionMembers() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['audit-attribution-members', companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      rows<AuditMember>(
        supabase
          .from('members')
          .select('id, company_id, auth_user_id, full_name, device_keys(id)')
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
export function useTodayPunches(day = romeDate(new Date())) {
  const companyId = useCompanyId();
  const queryClient = useQueryClient();
  const { from, to } = presenceWindow(day);

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
    queryKey: ['punches', companyId, day],
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
    queryFn: async () => {
      // Use server-stamped receipt time, not the operator's potentially wrong clock.
      const latest = await rows<{ received_at: string }>(supabase.from('punches').select('received_at')
        .eq('company_id', companyId).gte('device_ts', from).lt('device_ts', to)
        .order('received_at', { ascending: false }).limit(1));
      const asOf = latest[0]?.received_at;
      if (!asOf) return [];
      const punches = await collectById<Punch>((after) => {
        let query = supabase
          .from('punches')
          .select('id, member_id, punch_type, method, site_id, device_ts, received_at, receipt_code, flags')
          .eq('company_id', companyId)
          .gte('device_ts', from)
          .lt('device_ts', to)
          .lte('received_at', asOf)
          .order('id').limit(500);
        if (after) query = query.gt('id', after);
        return query;
      });
      return punches.sort((a, b) => b.device_ts.localeCompare(a.device_ts) || b.id.localeCompare(a.id));
    },
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
      const docs = await rows<BatchDocument>(
        supabase
          .from('documents')
          .select('id, batch_id, member_id, title, status, first_opened_at, storage_path')
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

export function useLeaveTypes() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['leaveTypes', companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      rows<LeaveType>(
        supabase
          .from('leave_types')
          .select('id, code, name, unit, requires_protocol, active, tracks_balance')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('code'),
      ),
  });
}

/** GDPR requests, open ones first by deadline (art. 12: one month, extendable once). */
export function useGdprRequests() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['gdpr', companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      rows<GdprRequest>(
        supabase
          .from('gdpr_requests')
          .select('id, member_id, kind, details, status, created_at, due_at, extended_at, extension_note, resolution_note, resolved_at')
          .eq('company_id', companyId)
          .order('due_at'),
      ),
  });
}

/** Decided and cancelled requests (both kinds), newest first; the history tab filters them. */
export function useRequestHistory() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['requestHistory', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const [leave, corrections] = await Promise.all([
        rows<LeaveRequest>(
          supabase
            .from('leave_requests')
            .select('id, member_id, start_date, end_date, quantity, note, status, created_at, decided_by, decided_at, decision_note, entered_by, leave_types(code, name, unit)')
            .eq('company_id', companyId)
            .neq('status', 'pending')
            .order('updated_at', { ascending: false })
            .limit(300),
        ),
        rows<PunchCorrection>(
          supabase
            .from('punch_corrections')
            .select('id, member_id, punch_type, requested_ts, reason, status, created_at, decided_by, decided_at, decision_note, entered_by')
            .eq('company_id', companyId)
            .neq('status', 'pending')
            .order('updated_at', { ascending: false })
            .limit(300),
        ),
      ]);
      return { leave, corrections };
    },
  });
}
