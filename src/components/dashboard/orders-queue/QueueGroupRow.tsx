'use client';

import type { ReactNode } from 'react';
import { CollapsibleGroupRow } from '@/components/ui/CollapsibleGroupRow';
import type { RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import { OrderGroupSummary } from './OrderGroupSummary';

export interface QueueGroupRowProps {
  /** One order's folded lines (singleton = a plain row; >1 = multi-product order). */
  group: RowGroup<ShippedOrder>;
  /** Zebra-stripe index of this group's visible header / singleton. The ledger
   *  advances one slot per top-level group (collapsed multi-child = one row).
   *  Expanded children continue locally from `base + 1` so they don't share the
   *  header's stripe. */
  baseStripeIndex: number;
  /**
   * Absolute ARIA row index of this group's summary (or of the leaf, when the
   * group is a singleton). Children follow at `rowIndex + 1 + i`.
   */
  rowIndex?: number;
  isMobile: boolean;
  /** Airtable grid-view skin. Passed to {@link OrderGroupSummary} so the collapsed
   *  multi-product header emits `data-grid-summary-row` and picks up the scoped
   *  spreadsheet gridlines. The leaf rows already carry the skin via `renderRow`. */
  gridSkin?: boolean;
  /** Ordered column models (sanitized). Threaded to the group summary so it
   *  tracks the same drag-reordered order as the leaf rows. */
  columns?: readonly OrdersQueueColumn[];
  /** Render a single queue row at the given zebra-stripe index. */
  renderRow: (record: ShippedOrder, stripeIndex: number, rowIndex?: number) => ReactNode;
}

/**
 * One order group inside a day band. A singleton order renders as a plain row
 * (the common case); a multi-product order (same order#, different products)
 * folds into a {@link CollapsibleGroupRow}. Shared by {@link OrdersGridView}
 * / LedgerGrid (flat spreadsheet) — no duplicate row/group markup.
 */
export function QueueGroupRow({ group, baseStripeIndex, rowIndex, isMobile, gridSkin = false, columns, renderRow }: QueueGroupRowProps) {
  // Singleton order → a plain row (renderRow already sets the row key).
  if (group.rows.length === 1) {
    return <>{renderRow(group.rows[0], baseStripeIndex, rowIndex)}</>;
  }
  // Multi-product order → one collapsed header, expand to reveal each product
  // line. Header takes `baseStripeIndex`; children continue after it.
  return (
    <CollapsibleGroupRow
      index={baseStripeIndex}
      rowIndex={rowIndex}
      showChevron={false}
      nestRail={!gridSkin}
      summary={<OrderGroupSummary rows={group.rows} isMobile={isMobile} gridSkin={gridSkin} columns={columns} />}
    >
      {/* Summary owns `rowIndex`; children follow it in order. */}
      {group.rows.map((row, i) =>
        renderRow(row, baseStripeIndex + 1 + i, rowIndex == null ? undefined : rowIndex + 1 + i),
      )}
    </CollapsibleGroupRow>
  );
}
