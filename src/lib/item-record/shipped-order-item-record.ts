/**
 * ShippedOrder → {@link ItemRecord}.
 *
 * A sales order row in this schema carries exactly ONE item (title, sku,
 * condition, quantity, serials), so it maps to a single-element list. The
 * signature returns an array anyway: every caller of the shared item surface
 * hands it a list, and an order that later grows real line rows must not force
 * its consumers to change shape.
 *
 * Pure — no fetch, no hook, no React. The reference facts that need a network
 * round trip (marketplace SKU mappings, external listing URLs) are composed by
 * the surface, not here.
 */

import type { ItemRecord } from '@/design-system/components/item-record';
import type { ShippedOrder } from '@/types/orders';

/** Split the aggregated `tech_serial_numbers` CSV into individual serials. */
export function splitOrderSerials(serialNumber: string | null | undefined): string[] {
  return String(serialNumber || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function shippedOrderToItemRecords(order: ShippedOrder): ItemRecord[] {
  const sku = String(order.sku || '').trim();
  const title = String(order.product_title || '').trim() || sku || `Order ${order.order_id}`;
  const expected = Number(order.quantity);

  return [
    {
      id: order.id,
      title,
      sku: sku || null,
      // Expected only. An order states what was SOLD; it counts nothing on the
      // floor, so a `counted/expected` progress face would be a claim this
      // record cannot make.
      quantity: {
        expected: Number.isFinite(expected) && expected > 0 ? expected : null,
      },
      conditionGrade: String(order.condition || '').trim() || null,
      serials: splitOrderSerials(order.serial_number),
      // No price. `sale_amount` is the ORDER total, not a per-unit figure, and
      // the money facts have one seat already — the `status` Display leaf's
      // commercial block. Painting the total in a unit-price track would be a
      // wrong number, not a missing one.
      unitPrice: null,
      imageUrl: null,
    },
  ];
}
