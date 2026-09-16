'use client';

/**
 * Reports → Packing → one packer's day, pack by pack.
 *
 * THE MOBILE-FIRST component for the operator's revised definition of done
 * (2026-09-15): *"identify previously packed orders and products, and the time
 * to pack for that SKU that has already been paired within the system"*. One
 * row per pack scan: when it was packed, the item number and SKU the pack was
 * resolved to, the product title, the order / tracking ref that identifies it,
 * and the time-to-pack standard it was weighted at.
 *
 * `source` is on the row, not hidden: `Set` means a human set that SKU's
 * standard, `Rules` / `Default` means the title regex guessed it. A manager
 * reading a packer's day needs to know which of those two they are looking at
 * before drawing a conclusion about the packer.
 *
 * Reads `usePackingReportRows(day, packerId)` — the SAME hook the desk By-item
 * table uses, narrowed server-side by `packerId`, so the two surfaces cannot
 * disagree about what one packer did.
 *
 * Cards in a `BottomSheet`, never a table (SURFACE_LAW §5). Read-only: editing
 * a SKU's standard is a PRODUCT verb and lives on the product record, which
 * each row links to — the manager reading a shift is not the person re-basing a
 * standard mid-scroll.
 */

import Link from 'next/link';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { usePackingReportRows } from '@/lib/packing/use-packing-report-rows';
import { formatPackMinutes } from '@/lib/packing/pack-standard-stops';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import { formatStageClockTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

const FACT = 'text-role-micro text-text-muted';

const SOURCE_LABEL: Record<PackingReportRow['tierSource'], string> = {
  profile: 'Set',
  clean: 'Set',
  rules: 'Rules',
  default: 'Default',
};

/** One pack: the product, the order it went to, and the standard it carried. */
function PackedItemCard({ row }: { row: PackingReportRow }) {
  const label = row.productTitle || row.sku || row.itemNumber || 'Not paired to a SKU';
  return (
    <li
      className={cn(
        'border border-border-hairline bg-surface-card px-3 py-2.5',
        MOBILE_ROW_CORNER,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-role-caption font-medium leading-tight text-text-default">
          {label}
        </p>
        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-text-default">
          {formatPackMinutes(row.estimatedMinutes)}
        </p>
      </div>
      {/*
       * ONE meta cluster, not independent chips: the identifiers and the time
       * answer the same question ("which pack was this, and when?"), and split
       * chips make a 390px row read as facts competing for one glance.
       */}
      <p className={cn(FACT, 'truncate')}>
        {formatStageClockTimePST(row.packedAt)}
        {row.itemNumber ? ` · ${row.itemNumber}` : ''}
        {row.sku && row.sku !== row.itemNumber ? ` · ${row.sku}` : ''}
        {` · ${SOURCE_LABEL[row.tierSource]}`}
      </p>
      {/*
       * Order number FIRST and labelled as one; the tracking is a different
       * fact and says so. This line used to print `Order <tracking>` for every
       * row, which named a carrier number as an order number (operator
       * 2026-09-16).
       */}
      <p className={cn(FACT, 'truncate')}>
        {row.orderNumber
          ? `Order ${row.orderNumber}`
          : row.trackingOrScanRef
            ? `Tracking ${row.trackingOrScanRef}`
            : 'No order or tracking on this scan'}
      </p>
      {row.sku ? (
        <Link
          href={`/products/sku/${encodeURIComponent(row.sku)}`}
          className="mt-1 inline-block text-role-micro font-semibold text-text-accent"
        >
          Time to pack for this SKU
        </Link>
      ) : (
        /*
         * An UNPAIRED pack — the scan never resolved to a catalog SKU, so it
         * carries the rule default (5 min) rather than a standard anybody set.
         * Saying so is the point: the operator asked for the time to pack of a
         * SKU "that has already been paired within the system", and a row that
         * silently showed 5 min would answer a question it cannot answer. Pair
         * it in Packing Review › Catalog link, then its standard is editable.
         */
        <p className="mt-1 text-role-micro text-text-faint">
          Not paired to a catalog SKU — weighted at the {formatPackMinutes(row.estimatedMinutes)}{' '}
          default. Pair it to give it its own time to pack.
        </p>
      )}
    </li>
  );
}

export function MobilePackerItemsSheet({
  dateKey,
  packer,
  onClose,
}: {
  dateKey: string;
  /** The packer being read, or null when the sheet is closed. */
  packer: { staffId: number; name: string } | null;
  onClose: () => void;
}) {
  // `enabled` keeps a closed sheet from fetching a day it is not showing.
  const { data, isLoading, isError } = usePackingReportRows(dateKey, packer?.staffId, {
    enabled: packer !== null,
  });
  const rows = data?.ok ? data.rows : [];
  const totalMinutes = rows.reduce((sum, r) => sum + r.estimatedMinutes, 0);

  return (
    <BottomSheet open={packer !== null} onClose={onClose} title={packer?.name ?? 'Packer'}>
      {/* The day's total for THIS packer — the same arithmetic the card
          showed, restated here so the drill-down stands on its own. */}
      {rows.length > 0 ? (
        <p className="pb-2 text-center text-role-micro tabular-nums text-text-soft">
          {rows.length} {rows.length === 1 ? 'pack' : 'packs'} ·{' '}
          {formatPackMinutes(totalMinutes)} standard
        </p>
      ) : null}
      {isLoading ? (
        <p className="px-1 py-4 text-role-caption text-text-muted">Loading their day…</p>
      ) : null}
      {isError || (!isLoading && !data) ? (
        <p role="alert" className="px-1 py-4 text-role-caption text-text-muted">
          Could not load their packs.
        </p>
      ) : null}
      {!isLoading && data && rows.length === 0 ? (
        <p className="px-1 py-4 text-role-caption text-text-muted">
          No packs recorded for them that day.
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2 pb-2">
          {rows.map((row) => (
            <PackedItemCard key={row.salId} row={row} />
          ))}
        </ul>
      ) : null}
    </BottomSheet>
  );
}
