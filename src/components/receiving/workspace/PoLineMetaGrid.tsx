'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { EmptySkuChipFace } from '@/components/ui/CopyChip';

/**
 * Boxed meta sub-grid for PO line accordion rows.
 * Order: qty | SKU | condition | serial | price (price last — variable width).
 * Empty SKU uses the mono `----` face (same slot as a filled SkuScanRefChip).
 *
 * Tracks: `auto auto auto 1fr auto` so qty/SKU/condition/price hug content and
 * the serials cell absorbs remaining width. Column separation is `gap-x-3`
 * whitespace (no `divide-x` / vertical meta hairlines) — inline PO meta favors
 * horizontal alignment + gap so the eye can sweep the row. Keep `border-t` as
 * the horizontal row seam. Nested CSS grid, not floating flex columns.
 *
 * Cells are flex + items-center so plain qty text shares a vertical midline
 * with underlined identity chips. Qty gets the same `pb-0.5` as chip labels
 * so its baseline sits with the chip text, not above the underline band.
 */
export function PoLineMetaGrid({
  qty,
  sku,
  condition,
  serial,
  price,
  className,
}: {
  qty: ReactNode;
  sku?: ReactNode;
  condition: ReactNode;
  serial?: ReactNode;
  price?: ReactNode;
  /**
   * @deprecated Thumb is the left rail on the nested grid row — meta no longer
   * indents under a chevron track. Ignored when present.
   */
  indent?: string;
  className?: string;
}) {
  return (
    <div
      data-po-line-meta-grid
      className={cn(
        'grid min-w-0 items-stretch border-t border-border-soft',
        'grid-cols-[auto_auto_auto_minmax(2.5rem,1fr)_auto]',
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
      <span data-col="sku" className="flex min-w-0 items-center justify-start truncate px-2 py-1">
        {sku ?? <EmptySkuChipFace dense />}
      </span>
      <span data-col="condition" className="flex min-w-0 items-center justify-start truncate px-2 py-1">
        {condition}
      </span>
      <span
        data-col="serial"
        className="flex min-w-0 items-stretch justify-start overflow-hidden p-0"
      >
        {serial ?? (
          <span className="px-2 py-1 text-text-faint/40">—</span>
        )}
      </span>
      <span
        className="flex items-center justify-end text-right tabular-nums px-2 py-1"
        data-col="price"
      >
        {price ?? null}
      </span>
    </div>
  );
}
