import { expect, it } from 'vitest';
import { employmentState, type EmploymentTerms } from './employment';
it('identifies historical, current, future and replaced employment versions without changing them', () => {
  const row: EmploymentTerms = { id:'1',effective_from:'2025-01-01',job_title:'Operaio',category:null,level:null,contract_type:'Test',ccnl_reference:null,weekly_hours:40,voided_at:null };
  const current={...row,id:'2',effective_from:'2026-01-01'};
  const future={...row,id:'3',effective_from:'2027-01-01'};
  const voided={...future,id:'4',voided_at:'2026-01-01T12:00:00Z'};
  const all=[row,current,future,voided];
  expect(all.map((term)=>employmentState(term,all,'2026-10-10'))).toEqual(['past','current','future','voided']);
  expect(employmentState(future,all,'2027-01-01')).toBe('current');
});
