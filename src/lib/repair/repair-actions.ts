/**
 * Repair bench-action vocabulary shared by the API (`/api/repair/actions`),
 * the mobile action sheet, and the action timeline — one set of words for the
 * six stored `action_type` values, so the sheet and the timeline cannot drift.
 *
 * `created_at` is stamped server-side on insert; there is deliberately no
 * client-supplied work-date field anywhere in this vocabulary.
 */
import type { RepairActionType } from '@/lib/repair-action-type-tone';

export interface RepairActionRecord {
  id: number;
  repair_id: number;
  action_type: string;
  part_name: string | null;
  old_sku: string | null;
  new_sku: string | null;
  old_serial: string | null;
  new_serial: string | null;
  duration_min: number | null;
  notes: string | null;
  staff_id: number | null;
  staff_name: string | null;
  created_at: string;
}

/** Operator wording: `label` names the bench act, `sub` says what it covers. */
export const REPAIR_ACTION_COPY: Record<RepairActionType, { label: string; sub: string }> = {
  repaired: { label: 'Repaired a component', sub: 'Soldered or repaired a component' },
  replaced: { label: 'Replaced a part', sub: 'Swapped in a new or donor part' },
  cleaned: { label: 'Cleaned', sub: 'Contacts, ports, or the mechanism' },
  tested: { label: 'Tested', sub: 'Verified working after the work' },
  awaiting_part: { label: 'Waiting on a part', sub: 'Part ordered — bench paused' },
  no_fix: { label: 'No fix', sub: 'Cannot be repaired' },
};

export function repairActionLabel(type: string): string {
  return REPAIR_ACTION_COPY[type as RepairActionType]?.label ?? type;
}

/**
 * A saved action that usually means the customer should hear something next.
 * Only a suggestion — the page offers "Draft customer update", never a send.
 */
export function actionSuggestsCustomerUpdate(type: string): boolean {
  return type === 'repaired' || type === 'tested';
}
