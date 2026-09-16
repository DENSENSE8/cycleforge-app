/**
 * Admin › Holds slot resolvers — pure.
 *
 * `held_at` resolves to the ABSOLUTE INSTANT, never to a pre-formatted or
 * relative face: the engine turns a `date` display type into the cell face and
 * keeps the instant behind it, and a resolver whose text depends on `now` would
 * sort and search differently on every render.
 *
 * `restore_status` resolves to the EFFECTIVE target (`holdRestoreStatus`), not
 * to the raw nullable column. The retired cell printed `restore_status ??
 * 'STOCKED'`, so a search for "STOCKED" has always matched the rows that
 * recorded nothing, and an unrecorded target must sort with the stocked ones
 * rather than ahead of every row as a blank.
 *
 * `held_by` is a PERSON value, not a string. The retired cell printed
 * `held_by_name ?? 'system'`; `'system'` was a placeholder for the absence of
 * an actor, and the person face already draws that absence — inventing a
 * staffer called "system" would put a name on a row nobody touched.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { holdRestoreStatus, type HeldUnitRow } from '@/lib/inventory/held-unit-row';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveAdminHoldsSlotValue(
  row: HeldUnitRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'admin-holds.unit':
      return { kind: 'value', text: str(row.id) };
    case 'admin-holds.serial':
      return { kind: 'value', text: str(row.serial_number) };
    case 'admin-holds.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'admin-holds.restore_status':
      return { kind: 'value', text: holdRestoreStatus(row) };
    case 'admin-holds.hold_reason':
      return { kind: 'value', text: str(row.hold_reason) };
    case 'admin-holds.held_at':
      return { kind: 'value', text: str(row.held_at) };
    case 'admin-holds.held_by':
      return { kind: 'person', staffId: row.held_by_staff_id ?? null, name: str(row.held_by_name) };
    default:
      return null;
  }
}
