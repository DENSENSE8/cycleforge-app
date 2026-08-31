/**
 * Serial unit → {@link ItemRecord}.
 *
 * The third adapter, and the one whose absence was the whole bug. `ItemRecord`
 * is the domain-neutral item face, and `shipped-order-item-record.ts` /
 * `receiving-line-item-record.ts` already map into it — so an order and a
 * carton both render their contents as items. Nothing mapped a serial unit, so
 * the unit pane had nothing to hand the shared card and painted its facts as a
 * label/value list instead: SKU, Product, Status, Grade, Location as bare text.
 * That was never a design decision about units; it was a missing file.
 *
 * A serial unit is exactly ONE physical thing, so this returns a one-element
 * list. The array signature matches its siblings: every consumer of the shared
 * surface hands it a list, and a caller must not have to special-case which
 * adapter it used.
 *
 * Pure — no fetch, no hook, no React. Facts that need a round trip stay with
 * the surface, which is why the photo arrives as an argument rather than being
 * read off the payload: `SerialUnitDetailPayload.photos` is a sibling array to
 * `serial_unit`, only present on an `?include=full` read, and a mapper that
 * quietly depended on that would be honest on one caller and wrong on the next.
 */

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
      // A unit is one item and it is physically accounted for — that is what a
      // serial unit row MEANS. `1/1` is the honest reading, and it is the same
      // counted/expected face a carton line paints, so the two never disagree
      // about what a full item looks like.
      quantity: { counted: 1, expected: 1 },
      // Grade CODE, not a label — the chip resolves hue and copy from the
      // shared condition registry.
      conditionGrade: String(unit.condition_grade ?? '').trim() || null,
      // The unit's own serial is its identity, and the face has a track for it.
      // An empty serial stays an EMPTY LIST, never `serialAbsent`: that flag is
      // an operator waiver ("this item has no serial"), and a unit whose serial
      // has simply not been captured yet is a different claim the row renders
      // as an em dash.
      serials: serial ? [serial] : [],
      // No price. The unit payload carries no per-unit figure, and inventing
      // one from an order total would be a wrong number rather than a missing
      // one — the same reasoning the order adapter records for `sale_amount`.
      unitPrice: null,
      imageUrl: opts.imageUrl?.trim() || null,
    },
  ];
}
