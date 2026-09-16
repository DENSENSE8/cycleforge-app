/**
 * Staff-day slot resolvers — pure.
 *
 * Same law as the sibling reports: dates resolve to the ABSOLUTE INSTANT and
 * numbers to their DIGITS, never a formatted face — a resolver whose text
 * depended on `now` or carried a suffix would sort and search differently from
 * what the header promised.
 *
 * `kind` resolves to the WORD the operator ruled ('Every day' / 'Just today',
 * the same vocabulary `/m/home` paints) rather than the raw enum: this is a
 * text fact, so search matches what a lead types.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { StaffDayReportRow } from '@/lib/reports/staff-day-rows';

export function resolveReportStaffDaySlotValue(
  row: StaffDayReportRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'report-staff-day.staff':
      return { kind: 'value', text: row.staffName };
    case 'report-staff-day.task':
      return { kind: 'value', text: row.title };
    case 'report-staff-day.checked_at':
      // null TEXT on an unchecked task: the blank rule sinks it and the pill
      // carries the words. '1970' or a fake '—' would sort above real checks.
      return { kind: 'value', text: row.checkedAt };
    case 'report-staff-day.kind':
      return { kind: 'value', text: row.kind === 'once' ? 'Just today' : 'Every day' };
    case 'report-staff-day.ticket':
      return { kind: 'value', text: row.ticketId == null ? null : String(row.ticketId) };
    case 'report-staff-day.order':
      return { kind: 'value', text: String(row.order) };
    default:
      return null;
  }
}
