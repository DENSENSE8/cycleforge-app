/**
 * FBA board item → {@link ItemRecord}.
 *
 * One line of an outbound FBA shipment. Like the repair adapter, this exists
 * because `/search?sel=fba:{id}` used to render an `EmptyState` and a button to
 * leave — the shipment's own contents were never shown on the surface that
 * found them.
 *
 * This is the one adapter with a real counted/expected pair to report: an FBA
 * line knows how many were planned and how many are physically staged, which is
 * exactly the progress face the shared item row was built around.
 *
 * Pure — no fetch, no hook, no React.
 */

import type { ItemRecord } from '@/design-system/components/item-record';
import type { FbaBoardItem } from '@/lib/fba/types';

export function fbaItemToItemRecords(item: FbaBoardItem): ItemRecord[] {
  const sku = String(item.sku ?? '').trim();
  const fnsku = String(item.fnsku ?? '').trim();
  const title = String(item.display_title ?? '').trim() || fnsku || sku || `Item ${item.item_id}`;

  const expected = Number(item.expected_qty);
  const counted = Number(item.actual_qty);

  return [
    {
      id: item.item_id,
      title,
      // The SKU track shows the merchant SKU when there is one; an FBA line
      // without one falls back to the FNSKU, which is the identifier the
      // operator is holding a label for.
      sku: sku || fnsku || null,
      quantity: {
        expected: Number.isFinite(expected) && expected > 0 ? expected : null,
        counted: Number.isFinite(counted) && counted >= 0 ? counted : null,
      },
      conditionGrade: String(item.condition ?? '').trim() || null,
      // An FBA line is a quantity of a fungible ASIN, not a serialized unit.
      // An empty list renders the em dash, which is the honest answer.
      serials: [],
      unitPrice: null,
      imageUrl: null,
    },
  ];
}
