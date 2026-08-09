'use client';

import type { ReactNode } from 'react';
import type { RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export interface QueueGroupRowProps {
  /** One order's lines (singleton or multi-product — always flat leaves). */
  group: RowGroup<ShippedOrder>;
  /** Zebra-stripe index of this group's first leaf. Children continue locally. */
  baseStripeIndex: number;
  /**
   * Absolute ARIA row index of this group's first leaf. Children follow at
   * `rowIndex + i`.
   */
  rowIndex?: number;
  /** Render a single queue row at the given zebra-stripe index. */
  renderRow: (record: ShippedOrder, stripeIndex: number, rowIndex?: number) => ReactNode;
}

/**
 * One order group inside a day band.
 *
 * Always a flat list of leaf lines — no collapsible order summary. Multi-product
 * parent rollups belong only on the drill parent map
 * (`OrdersDrillHost` / `LedgerDrillParentMap`). Shared by {@link OrdersGridHost}.
 */
export function QueueGroupRow({
  group,
  baseStripeIndex,
  rowIndex,
  renderRow,
}: QueueGroupRowProps) {
  return (
    <>
      {group.rows.map((row, i) =>
        renderRow(
          row,
          baseStripeIndex + i,
          rowIndex == null ? undefined : rowIndex + i,
        ),
      )}
    </>
  );
}
