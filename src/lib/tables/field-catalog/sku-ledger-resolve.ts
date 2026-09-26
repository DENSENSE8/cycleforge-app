/** Stock-ledger slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { SkuLedgerTableRow } from '@/lib/inventory/sku-ledger-row';
import { takeReasonLedgerLabel } from '@/lib/inventory/take-reason';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * The signed movement, as the operator reads it. Exported because the adapter's
 * title-line fallback and the bound track must never disagree about the sign.
 */
export function skuLedgerDeltaText(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

/**
 * The reason as the operator reads it. Exported because the adapter's title and
 * the bound track (and the item header's sort) must never disagree about it.
 */
export function skuLedgerReasonText(reason: string | null | undefined): string | null {
  const code = str(reason);
  return code ? takeReasonLedgerLabel(code) : null;
}

export function resolveSkuLedgerSlotValue(
  row: SkuLedgerTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'sku-ledger.ref_order':
      return { kind: 'value', text: str(row.ref_order_id) };
    case 'sku-ledger.reason':
      return { kind: 'value', text: skuLedgerReasonText(row.reason) };
    case 'sku-ledger.notes':
      return { kind: 'value', text: str(row.notes) };
    case 'sku-ledger.delta':
      return { kind: 'value', text: skuLedgerDeltaText(row.delta) };
    case 'sku-ledger.dimension':
      return { kind: 'value', text: str(row.dimension) };
    case 'sku-ledger.staff':
      return { kind: 'person', staffId: row.staff_id ?? null, name: str(row.staff_name) };
    case 'sku-ledger.ref_serial_unit':
      return { kind: 'value', text: str(row.ref_serial_unit_id) };
    case 'sku-ledger.ref_receiving_line':
      return { kind: 'value', text: str(row.ref_receiving_line_id) };
    case 'sku-ledger.when':
      return { kind: 'value', text: str(row.created_at) };
    default:
      return null;
  }
}
