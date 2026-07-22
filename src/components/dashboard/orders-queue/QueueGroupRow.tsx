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
  /** Zebra-stripe index of this group's FIRST row within its day band. Children
   *  increment from it so striping runs continuously across the day (group
   *  children included), matching the flat `displayedRecords` order. */
  baseStripeIndex: number;
  isMobile: boolean;
  /** Airtable grid-view skin. Passed to {@link OrderGroupSummary} so the collapsed
   *  multi-product header emits `data-grid-summary-row` and picks up the scoped
   *  spreadsheet gridlines. The leaf rows already carry the skin via `renderRow`. */
  gridSkin?: boolean;
  /** Ordered column models (sanitized). Threaded to the group summary so it
   *  tracks the same drag-reordered order as the leaf rows. */
  columns?: readonly OrdersQueueColumn[];
  /** Render a single queue row at the given zebra-stripe index. */
  renderRow: (record: ShippedOrder, stripeIndex: number) => ReactNode;
}

/**
 * One order group inside a day band. A singleton order renders as a plain row
 * (the common case); a multi-product order (same order#, different products)
 * folds into a {@link CollapsibleGroupRow}. Extracted from {@link QueueDateSection}
 * so the dense table body AND the virtualized lane body ({@link VirtualQueueSections})
 * render groups from ONE source — no duplicate row/group markup.
 */
export function QueueGroupRow({ group, baseStripeIndex, isMobile, gridSkin = false, columns, renderRow }: QueueGroupRowProps) {
  // Singleton order → a plain row (renderRow already sets the row key).
  if (group.rows.length === 1) {
    return <>{renderRow(group.rows[0], baseStripeIndex)}</>;
  }
  // Multi-product order → one collapsed header, expand to reveal each product
  // line. `index` zebra-stripes the header in step with the sibling rows.
  return (
    <CollapsibleGroupRow
      index={baseStripeIndex}
      showChevron={false}
      nestRail={!gridSkin}
      summary={<OrderGroupSummary rows={group.rows} isMobile={isMobile} gridSkin={gridSkin} columns={columns} />}
    >
      {group.rows.map((row, i) => renderRow(row, baseStripeIndex + i))}
    </CollapsibleGroupRow>
  );
}
