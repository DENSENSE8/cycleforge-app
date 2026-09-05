'use client';

/**
 * A serial unit's contents, through the shared item face.
 *
 * The unit sibling of {@link SearchOrderItems}. A unit is one item, so the card
 * paints one row — thumb, title, and the qty · price · condition · SKU · serials · location ledger
 * — which is the same face an order line and a carton line already get. Before
 * this, a unit's SKU / product / grade were label/value text rows, so the same
 * facts read as a different kind of thing depending on what you searched.
 */

import { useMemo } from 'react';
import { ItemRecordCard } from '@/design-system/components/item-record';
import { serialUnitToItemRecords } from '@/lib/item-record/serial-unit-item-record';
import type { SerialUnitDetailPayload } from '@/components/inventory/types';

export function SearchUnitItems({
  unit,
  imageUrl = null,
}: {
  unit: SerialUnitDetailPayload['serial_unit'];
  /** Leading photo, resolved by the pane — see the adapter's docblock. */
  imageUrl?: string | null;
}) {
  const items = useMemo(
    () => serialUnitToItemRecords(unit, { imageUrl }),
    [unit, imageUrl],
  );

  return (
    <ItemRecordCard
      items={items}
      topRule={false}
      emptyTitle="No item"
      emptyDescription="This unit carries no product facts."
    />
  );
}
