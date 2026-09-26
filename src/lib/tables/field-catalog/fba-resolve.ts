/** FBA slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { FbaBoardItem } from '@/lib/fba/types';
import { FBA_STATUS_LABEL } from '@/lib/fba/status';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveFbaSlotValue(
  item: FbaBoardItem,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'fba.asin':
      return { kind: 'value', text: str(item.asin) };
    case 'fba.fnsku':
      return { kind: 'value', text: str(item.fnsku) };
    case 'fba.qty':
      return { kind: 'value', text: `${item.actual_qty} / ${item.expected_qty}` };
    case 'fba.condition':
      return { kind: 'value', text: str(item.condition) };
    case 'fba.notes':
      return { kind: 'value', text: str(item.item_notes) };
    case 'fba.status': {
      const s = String(item.item_status ?? '').toUpperCase();
      return { kind: 'value', text: FBA_STATUS_LABEL[s] ?? (s ? s.replace(/_/g, ' ') : null) };
    }
    case 'fba.due': {
      const raw = str(item.due_date);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw.slice(0, 10)) : null };
    }
    case 'fba.plan':
      return { kind: 'value', text: str(item.shipment_ref) ?? str(item.amazon_shipment_id) };
    default:
      return null;
  }
}
