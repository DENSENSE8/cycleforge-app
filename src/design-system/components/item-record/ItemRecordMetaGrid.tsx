'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { EmptySkuChipFace, UnitPriceChip } from '@/components/ui/CopyChip';

/** Desk six-track order. Phone ItemRecordMobileMeta must not mount this grid. */
export const ITEM_RECORD_META_TRACKS = [
  'qty',
  'price',
  'condition',
  'sku',
  'serial',
  'location',
] as const;

/** Inset column rule. Outline does not shift the six-track geometry. */
export const ITEM_RECORD_META_COL_RULE =
  'outline outline-1 -outline-offset-1 outline-border-subtle';

/**
 * Boxed meta sub-grid for an item row.
 * Order: qty | price | condition | sku | serial | location.
 *
 * Always six tracks. Empty SKU uses the mono `----` face (same slot as a
 * filled chip); empty price uses {@link UnitPriceChip} with no amount, so an
 * unpriced item keeps the price column rather than painting a blank cell.
 *
 * Tracks: qty/price/condition/sku hug, serial absorbs remaining width,
 * location minmax. Column rules are inset `outline` (M3) — never `border`
 * (layout shift) and never box-shadow (F3). Nested CSS grid, not floating
 * flex columns.
 *
 * Ported from `receiving/workspace/PoLineMetaGrid`; the receiving-only
 * `unitsChrome` door-flow flag did not come with it — it was a host gate for
 * editors, and this grid mounts none.
 */
export function ItemRecordMetaGrid({
  qty,
  sku,
  condition,
  serial,
  price,
  location,
  className,
}: {
  qty: ReactNode;
  sku?: ReactNode;
  condition?: ReactNode;
  serial?: ReactNode;
  price?: ReactNode;
  location?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-item-record-meta-grid
      className={cn(
        'grid min-w-0 items-stretch',
        'grid-cols-[auto_auto_auto_auto_minmax(2.5rem,1fr)_minmax(5rem,auto)]',
        'gap-x-0',
        'text-role-eyebrow uppercase tracking-widest leading-none',
        className,
      )}
    >
      <span
        data-col="qty"
        className={cn(
          ITEM_RECORD_META_COL_RULE,
          'flex min-w-0 items-center justify-start truncate tabular-nums px-2 py-1 pb-[0.375rem] font-semibold text-text-muted',
        )}
      >
        {qty}
      </span>
      <span
        className={cn(
          ITEM_RECORD_META_COL_RULE,
          'flex items-center justify-end text-right tabular-nums px-2 py-1',
        )}
        data-col="price"
      >
        {price ?? <UnitPriceChip amount={null} dense />}
      </span>
      <span
        data-col="condition"
        className={cn(
          ITEM_RECORD_META_COL_RULE,
          'flex min-w-0 items-center justify-start truncate px-2 py-1',
        )}
      >
        {condition}
      </span>
      <span
        data-col="sku"
        className={cn(
          ITEM_RECORD_META_COL_RULE,
          'flex min-w-0 items-center justify-start truncate px-2 py-1',
        )}
      >
        {sku ?? <EmptySkuChipFace dense />}
      </span>
      <span
        data-col="serial"
        className={cn(
          ITEM_RECORD_META_COL_RULE,
          'flex min-w-0 items-stretch justify-start overflow-hidden p-0',
        )}
      >
        {serial ?? <span className="px-2 py-1 text-text-faint/40">—</span>}
      </span>
      <span
        className={cn(
          ITEM_RECORD_META_COL_RULE,
          'flex min-w-0 items-center justify-end px-2 py-1 text-right',
        )}
        data-col="location"
      >
        {location}
      </span>
    </div>
  );
}
