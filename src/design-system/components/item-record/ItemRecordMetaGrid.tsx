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

/**
 * Boxed meta sub-grid for an item row.
 * Order: qty | price | condition | sku | serial | location.
 *
 * Always six tracks. Empty SKU uses the mono `----` face (same slot as a
 * filled chip); empty price uses {@link UnitPriceChip} with no amount, so an
 * unpriced item keeps the price column rather than painting a blank cell.
 *
 * Tracks: qty/price/condition/sku hug, serial absorbs remaining width,
 * location minmax. Separation is whitespace — `gap-x-3`, no rule.
 * Nested CSS grid, not floating flex columns.
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
        'gap-x-3',
        'text-role-eyebrow uppercase tracking-widest leading-none',
        className,
      )}
    >
      <span
        data-col="qty"
        className="flex min-w-0 items-center justify-start truncate tabular-nums px-2 py-1 pb-[0.375rem] font-semibold text-text-muted"
      >
        {qty}
      </span>
      <span
        className="flex items-center justify-end text-right tabular-nums px-2 py-1"
        data-col="price"
      >
        {price ?? <UnitPriceChip amount={null} dense />}
      </span>
      <span
        data-col="condition"
        className="flex min-w-0 items-center justify-start truncate px-2 py-1"
      >
        {condition}
      </span>
      <span data-col="sku" className="flex min-w-0 items-center justify-start truncate px-2 py-1">
        {sku ?? <EmptySkuChipFace dense />}
      </span>
      <span
        data-col="serial"
        className="flex min-w-0 items-stretch justify-start overflow-hidden p-0"
      >
        {serial ?? <span className="px-2 py-1 text-text-faint/40">—</span>}
      </span>
      <span
        className="flex min-w-0 items-center justify-end px-2 py-1 text-right"
        data-col="location"
      >
        {location}
      </span>
    </div>
  );
}
