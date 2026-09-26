/** Order-import-staging slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { OrderImportRowView } from '@/lib/orders/order-import-descriptor';
import { sourcePlatformMeta } from '@/lib/source-platform';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveOrdersImportSlotValue(
  row: OrderImportRowView,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'orders-import.order':
      return { kind: 'value', text: str(row.orderNumber) };
    case 'orders-import.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'orders-import.qty':
      return { kind: 'value', text: str(row.quantity) };
    case 'orders-import.customer':
      return { kind: 'value', text: str(row.customerName) };
    case 'orders-import.tracking':
      return { kind: 'value', text: str(row.trackingNumber) };
    case 'orders-import.platform': {
      const raw = str(row.platform);
      if (!raw) return { kind: 'value', text: null };
      // A channel the platforms registry knows reads as its own name; one it
      // does not reads back exactly what the file said, so an operator can see
      // the value that failed to match instead of a blank.
      return { kind: 'value', text: str(sourcePlatformMeta(raw).label) ?? raw };
    }
    default:
      return null;
  }
}
