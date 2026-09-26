/** Unit-allocations slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';

/** Who allocated a unit when no staffer is joined to the row. */
export const ALLOCATION_SYSTEM_ACTOR = 'system';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveUnitAllocationsSlotValue(
  row: UnitAllocationTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'unit-allocations.order':
      /** The bare number, not `#123`. */
      return { kind: 'value', text: str(row.order_id) };
    case 'unit-allocations.unit':
      return { kind: 'value', text: str(row.serial_unit_id) };
    case 'unit-allocations.state':
      return { kind: 'value', text: str(row.state) };
    case 'unit-allocations.allocated':
      return { kind: 'value', text: str(row.allocated_at) };
    case 'unit-allocations.released':
      // Still held ⇒ nothing to say. The retired cell printed an em dash; the
      // dash is the CELL's empty face, never a stored value.
      return { kind: 'value', text: str(row.released_at) };
    case 'unit-allocations.reason':
      return { kind: 'value', text: str(row.released_reason) };
    case 'unit-allocations.allocated_by':
      // `system` is the honest answer for an unattributed allocation — never a
      // bare numeric id, never an empty cell that reads as missing data.
      return { kind: 'value', text: str(row.allocated_by_name) ?? ALLOCATION_SYSTEM_ACTOR };
    default:
      return null;
  }
}
