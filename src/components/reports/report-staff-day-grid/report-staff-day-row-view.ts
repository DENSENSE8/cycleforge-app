/**
 * `StaffDayReportRow → CompoundRowView` — the staff-day adapter.
 * time is the fact ("checked off at this time", operator 2026-09-15).
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';
import type { StaffDayReportRow } from '@/lib/reports/staff-day-rows';

const CHECKED_LABEL = 'Checked';
const NOT_CHECKED_LABEL = 'Not checked';

/** Clock-time face for the Dates Hash line — the day is the page's, the time is the row's. */
function clockFace(iso: string | null): { label: string; dateKey: string } | null {
  if (!iso) return null;
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return null;
  return { label: format(moment, 'h:mm a'), dateKey: format(moment, 'yyyy-MM-dd') };
}

export function reportStaffDayCompoundView(row: StaffDayReportRow): CompoundRowView {
  const at = clockFace(row.checkedAt);
  const done = row.checkedAt != null;

  return {
    id: `${row.staffId}-${row.itemId}`,
    thumbUrl: null,
    title: row.title,
    // A task row opens nothing: it IS the record. The phone owns the per-person
    // drill; a link here would duplicate `/m/reports`'s sheet on the desk.
    titleHref: null,
    // Nothing under the title: cadence and ticket are status tracks, and a
    // note repeating them would double a column.
    note: null,
    identityFace: compoundIdentityFace(String(row.ticketId ?? row.itemId), 'ID'),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: done ? CHECKED_LABEL : NOT_CHECKED_LABEL,
    stateTone: (done ? 'done' : 'neutral') satisfies CompoundStateTone,
    stateTip: done ? `Ticked at ${at?.label ?? ''}` : 'Not ticked on this day',
    orderedAt: at
      ? { label: at.label, tip: `Checked ${at.label}`, dateKey: at.dateKey }
      : null,
    ...(at ? { startedHover: `Checked ${at.label}` } : null),
    delay: null,
    amount: null,
  };
}
