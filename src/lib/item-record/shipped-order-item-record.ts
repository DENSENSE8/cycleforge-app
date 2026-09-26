/** ShippedOrder → {@link ItemRecord}. */

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
      // No price. `sale_amount` is the ORDER total, not a per-unit figure, and the money facts have one seat already — the `status` Display…
      unitPrice: null,
      imageUrl: null,
    },
  ];
}
