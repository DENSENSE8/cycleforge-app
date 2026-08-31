/**
 * Repair service record → {@link ItemRecord}.
 *
 * A repair is one device, so this returns a one-element list like the order and
 * unit adapters. Before it existed, `/search?sel=repair:{id}` rendered an
 * `EmptyState` with the ticket number and a button to go and open the record
 * somewhere else — a search result that answered nothing and sent the operator
 * off the surface.
 *
 * Pure — no fetch, no hook, no React.
 */

import type { ItemRecord } from '@/design-system/components/item-record';
import type { RSRecord } from '@/lib/neon/repair-service-queries';

export function repairToItemRecords(repair: RSRecord): ItemRecord[] {
  const sku = String(repair.source_sku ?? '').trim();
  const serial = String(repair.serial_number ?? '').trim();
  const title =
    String(repair.product_title ?? '').trim() ||
    sku ||
    String(repair.ticket_number ?? '').trim() ||
    `Repair ${repair.id}`;

  return [
    {
      id: repair.id,
      title,
      sku: sku || null,
      // One device, in hand — a repair exists because the thing is here.
      quantity: { counted: 1, expected: 1 },
      // A repair has no condition GRADE. Its `issue` is a fault description,
      // not a grade code, and feeding it to the grade chip would ask the
      // condition registry to resolve a hue for free text.
      conditionGrade: null,
      serials: serial ? [serial] : [],
      // `price` is the quoted repair charge, not a per-unit product price.
      // Painting it in the unit-price track would be a different number wearing
      // the right label.
      unitPrice: null,
      imageUrl: null,
    },
  ];
}
