/**
 * Bulk-allocate slot resolvers — pure.
 *
 * Two of the eight facts have no row column behind them, and this is where
 * they come from:
 *
 * - `qty` — `candidateQty`, the floor-clamped parse of the TEXT column
 *   `orders.quantity` the retired page did inline. Resolving `quantity_str`
 *   raw would sort `10` before `2` and search `"1"` into every row.
 * - `eligible` — `candidateStateWord`, the closed vocabulary the STATE pill
 *   prints. The resolver returns the same WORD the pill shows, because this
 *   function is the ONE source for both the sort comparator and the search
 *   index: a header that ordered rows by a boolean while the pill said
 *   "No stock" would order the desk by a fact nobody can see.
 *
 * `ordered` resolves to the ABSOLUTE INSTANT, never a formatted or relative
 * face: the engine turns a `date` display type into the cell face and keeps
 * the instant behind it, and a resolver whose text depends on `now` would sort
 * and search differently on every render. It prefers `order_date` and falls
 * back to `created_at`, the same preference the adapter's tooltip names.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import {
  candidateQty,
  candidateStateWord,
  type AllocationCandidateRow,
} from '@/lib/inventory/allocation-candidate-row';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveAdminBulkAllocateSlotValue(
  row: AllocationCandidateRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'admin-bulk-allocate.order_id':
      return { kind: 'value', text: str(row.order_id) };
    case 'admin-bulk-allocate.ext_id':
      return { kind: 'value', text: str(row.order_id_text) };
    case 'admin-bulk-allocate.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'admin-bulk-allocate.condition':
      return { kind: 'value', text: str(row.condition) };
    case 'admin-bulk-allocate.qty':
      return { kind: 'value', text: String(candidateQty(row)) };
    case 'admin-bulk-allocate.available_stocked':
      return { kind: 'value', text: String(row.available_stocked) };
    case 'admin-bulk-allocate.eligible':
      return { kind: 'value', text: candidateStateWord(row) };
    case 'admin-bulk-allocate.ordered':
      return { kind: 'value', text: row.order_date ?? row.created_at ?? null };
    default:
      return null;
  }
}
