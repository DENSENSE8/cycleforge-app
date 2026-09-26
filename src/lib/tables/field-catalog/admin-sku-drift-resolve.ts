/** SKU stock-drift slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { SkuDriftRow } from '@/lib/inventory/drift-rows';

function num(value: number | null | undefined): CompoundSlotValue {
  return { kind: 'value', text: typeof value === 'number' ? String(value) : null };
}

export function resolveAdminSkuDriftSlotValue(
  row: SkuDriftRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'admin-sku-drift.sku': {
      const sku = String(row.sku ?? '').trim();
      return { kind: 'value', text: sku || null };
    }
    case 'admin-sku-drift.warehouse_drift':
      return num(row.warehouse_drift);
    case 'admin-sku-drift.boxed_drift':
      return num(row.boxed_drift);
    case 'admin-sku-drift.stored_warehouse':
      return num(row.stored_stock);
    case 'admin-sku-drift.ledger_warehouse':
      return num(row.ledger_warehouse);
    case 'admin-sku-drift.stored_boxed':
      return num(row.stored_boxed);
    case 'admin-sku-drift.ledger_boxed':
      return num(row.ledger_boxed);
    default:
      return null;
  }
}
