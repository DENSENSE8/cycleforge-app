/** Serial unit → {@link ItemRecord}. */

import type { ItemRecord } from '@/design-system/components/item-record';
import type { SerialUnitDetailPayload } from '@/components/inventory/types';

/** The unit row itself — the payload's `serial_unit`, not the whole envelope. */
export type SerialUnitRecordSource = SerialUnitDetailPayload['serial_unit'];

export interface SerialUnitItemRecordOptions {
  /**
   * Thumbnail for the item face. The unit's photos live beside the row in the
   * payload, so the surface resolves which one leads and passes it here.
   * Absent renders the shared package placeholder, same as any other item.
   */
  imageUrl?: string | null;
}

export function serialUnitToItemRecords(
  unit: SerialUnitRecordSource,
  opts: SerialUnitItemRecordOptions = {},
): ItemRecord[] {
  const sku = String(unit.sku ?? '').trim();
  const serial = String(unit.serial_number ?? '').trim();
  // Same fallback ladder as the order adapter: the resolved product name, then
  // the SKU, then the identity the operator actually typed to get here.
  const title =
    String(unit.product_title ?? '').trim() || sku || serial || `Unit ${unit.id}`;

  return [
    {
      id: unit.id,
      title,
      sku: sku || null,
      // A unit is one item and it is physically accounted for — that is what a serial unit row MEANS.
      quantity: { counted: 1, expected: 1 },
      // Grade CODE, not a label — the chip resolves hue and copy from the
      // shared condition registry.
      conditionGrade: String(unit.condition_grade ?? '').trim() || null,
      // The unit's own serial is its identity, and the face has a track for it.
      serials: serial ? [serial] : [],
      // No price. The unit payload carries no per-unit figure, and inventing
      // one from an order total would be a wrong number rather than a missing
      // one — the same reasoning the order adapter records for `sale_amount`.
      unitPrice: null,
      imageUrl: opts.imageUrl?.trim() || null,
    },
  ];
}
