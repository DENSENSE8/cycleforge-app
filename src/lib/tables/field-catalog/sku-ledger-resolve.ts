/**
 * Stock-ledger slot resolvers — pure.
 *
 * `when` resolves to the ABSOLUTE INSTANT, never to a pre-formatted or relative
 * face: the engine turns a `date` display type into the cell face and keeps the
 * instant behind it, and a resolver whose text depended on `now` would sort and
 * search differently on every render.
 *
 * The refs resolve to the BARE number, not to the retired cell's `ord#12`
 * prefix. The prefix existed to tell three values apart inside one string; each
 * ref now has its own header saying which one it is, so the prefix would be a
 * label repeated in every cell — and it would break the id track's digit-aware
 * collation (`grid-column-sort.ts`), which is what makes `48` sort before
 * `900`.
 *
 * `delta` keeps its SIGN in the text (`+12`, `-240`). The sign is the fact —
 * the retired cell carried it in both the glyph and the colour, and tone is
 * never the fact. `Number('+12')` is `12`, so the numeric comparator still
 * orders the column as arithmetic.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { SkuLedgerTableRow } from '@/lib/inventory/sku-ledger-row';

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

export function resolveSkuLedgerSlotValue(
  row: SkuLedgerTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'sku-ledger.ref_order':
      return { kind: 'value', text: str(row.ref_order_id) };
    case 'sku-ledger.reason':
      return { kind: 'value', text: str(row.reason) };
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
