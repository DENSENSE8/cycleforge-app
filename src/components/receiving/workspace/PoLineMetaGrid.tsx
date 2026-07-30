'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { META_COL } from '@/components/ui/RowMetaColumns';
import { EmptySkuChipFace } from '@/components/ui/CopyChip';

/**
 * Fixed-column meta grid for PO line accordion rows.
 * Order: qty | SKU | condition | serial | price (price last — variable width).
 * Empty SKU uses the mono `----` face (same slot as a filled SkuScanRefChip).
 *
 * Cells are flex + items-center so plain qty text shares a vertical midline
 * with underlined identity chips (icon + label + border-b). Qty gets the same
 * `pb-0.5` as chip labels so its baseline sits with the chip text, not above
 * the underline band.
 *
 * Justification follows the house LedgerGrid rule for digit tracks
 * (qty · sku · price) end-align; word tracks (condition) start-align.
 * Serial chips start-align next to condition — the serial column is the
 * flex `1fr` slack absorber, so end-align would park the chip at the far
 * right against the price (CopyChip SerialChip in this slot).
 */
export function PoLineMetaGrid({
  qty,
  sku,
  condition,
  serial,
  price,
  indent = META_COL.indentWide,
  className,
}: {
  qty: ReactNode;
  sku?: ReactNode;
  condition: ReactNode;
  serial?: ReactNode;
  price?: ReactNode;
  indent?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-0.5 grid min-w-0 items-center gap-x-1.5 leading-none text-role-eyebrow uppercase tracking-widest',
        className,
      )}
      style={{
        paddingLeft: indent,
        gridTemplateColumns: [
          META_COL.qtyColWide,
          META_COL.skuCol,
          // Fixed track sized to the longest condition chip ("PARTS" / "L-NEW").
          // A fixed width (not `max-content`) keeps the condition chip starting at
          // the same x on every row so the columns line up vertically; the shared
          // 2.5rem condCol is too narrow (clips "PARTS"), hence the dedicated token.
          META_COL.poCondCol,
          META_COL.serialCol,
          META_COL.priceCol,
        ].join(' '),
      }}
    >
      <span data-col="qty" className="flex min-w-0 items-center justify-end truncate tabular-nums pb-0.5">
        {qty}
      </span>
      <span data-col="sku" className="flex min-w-0 items-center justify-end truncate">
        {sku ?? <EmptySkuChipFace dense />}
      </span>
      <span data-col="condition" className="flex min-w-0 items-center justify-start truncate">
        {condition}
      </span>
      <span data-col="serial" className="flex min-w-0 items-center justify-start gap-1 truncate">
        {serial ?? <span className="text-text-faint/40">—</span>}
      </span>
      <span className="flex justify-self-end items-center justify-end text-right tabular-nums" data-col="price">
        {price ?? null}
      </span>
    </div>
  );
}
