/**
 * `StaffDirectoryRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * The note line answers the question the Team page exists to answer: can this
 * person actually sign in? A teammate with no PIN and PIN auth cannot, and that
 * was invisible on the retired display (`has_pin` had no column).
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';

function toneFor(row: StaffDirectoryRow): CompoundStateTone {
  if (!row.active) return 'alert';
  return 'done';
}

function noteFor(row: StaffDirectoryRow): string | null {
  if (!row.active) return 'Deactivated';
  if (row.auth_method === 'pin' && !row.has_pin) return 'No PIN set — cannot sign in';
  if (row.requires_sensitive_stepup) return 'Step-up required for sensitive actions';
  return null;
}

export function staffDirectoryCompoundView(row: StaffDirectoryRow): CompoundRowView {
  return {
    id: String(row.id),
    // The staff photo gutter is the one place in this port where `thumb` carries
    // a real fact — resolved by the identity cache from the staff id, not a URL
    // this adapter invents.
    thumbUrl: null,
    title: String(row.name ?? '').trim() || `Staff #${row.id}`,
    note: noteFor(row),
    orderId: String(row.id),
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: String(row.status ?? '').trim() || (row.active ? 'Active' : 'Inactive'),
    stateTone: toneFor(row),
    stateTip: String(row.role ?? '').trim() || undefined,
    delay: null,
    amount: null,
  };
}
