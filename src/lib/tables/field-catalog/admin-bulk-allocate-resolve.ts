/** Bulk-allocate slot resolvers — pure. */

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
