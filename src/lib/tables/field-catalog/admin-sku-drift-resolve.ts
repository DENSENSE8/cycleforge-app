/**
 * SKU stock-drift slot resolvers — pure.
 *
 * Every fact is a signed integer, and each resolves to the BARE number as text:
 * no `+` prefix and no colour. The columns' `slotDisplayType` is `number`, so
 * `compareGridValues` parses this text back into a number to order the column;
 * a decorated face would either fail to parse or sort as a string ("10" before
 * "2"). Direction is spelled into the words the title and the pill carry, in
 * `admin-sku-drift-row-view.ts`.
 *
 * `0` resolves to `'0'`, never to `null`: a zero counter is a fact this desk
 * exists to compare, and dashing it would read as "not fetched".
 */

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
