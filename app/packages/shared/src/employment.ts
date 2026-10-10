/** Operational references; roles and payroll rules are deliberately separate. */
export interface EmploymentTerms {
  id: string;
  effective_from: string;
  job_title: string;
  category: string | null;
  level: string | null;
  contract_type: string;
  ccnl_reference: string | null;
  weekly_hours: number;
  voided_at: string | null;
}

export function employmentState(terms: EmploymentTerms, all: EmploymentTerms[], today: string): 'voided' | 'future' | 'current' | 'past' {
  if (terms.voided_at) return 'voided';
  if (terms.effective_from > today) return 'future';
  const newer = all.some((item) => !item.voided_at && item.effective_from > terms.effective_from && item.effective_from <= today);
  return newer ? 'past' : 'current';
}
