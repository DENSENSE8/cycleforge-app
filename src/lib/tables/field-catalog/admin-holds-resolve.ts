/** Admin › Holds slot resolvers — pure. */

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
