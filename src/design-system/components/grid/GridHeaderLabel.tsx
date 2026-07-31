'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { ColumnTypeGlyph } from '@/components/ui/table-column-config/column-type-glyph';
import { gridHeaderShowsLabel } from './grid-column-geometry';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

type GridHeaderSortDir = 'asc' | 'desc';

/**
 * The INSIDE of a ledger grid column header: type glyph → label (or the
 * screen-reader-only label when the track is too narrow) → sort chevron.
 *
 * Shared INNER label/chevron block. OUTER sticky row/cell chrome lives in
 * {@link LedgerGridColumnHeader} (Receiving / Incoming adapters; Orders still
 * deferred — resize/reorder recipe). Domain wrappers inject layout APIs +
 * glyph/label overrides; they must not re-fork this inner block.
 *
 * The narrow-track fallback is a GLYPH, never a truncated word: a glyph is a
 * complete symbol an operator learns, while `UNBO…` has to be decoded and can
 * be misread. `gridHeaderShowsLabel` decides, and it checks the RESOLVED label
 * (including a runtime override) actually fits — not just the track width.
 */
export function GridHeaderLabel({
  column,
  label,
  glyph,
  sortDir = null,
}: {
  column: LedgerGridColumnModel;
  /**
   * Runtime label override — Unbox swaps `stage` to `Unboxed` / `Scanned` /
   * `Tested`. Passed through to the fit test so the track is measured against
   * the word actually rendered.
   */
  label?: string;
  /** Surface-specific glyph (e.g. Unbox's stage clock); defaults to the type glyph. */
  glyph?: ReactNode;
  /** Non-null only when THIS column is the active sort. */
  sortDir?: GridHeaderSortDir | null;
}) {
  const fullLabel = label ?? column.label ?? column.key;
  const visibleLabel = label ?? column.gridLabel ?? column.label ?? column.key;
  const showLabel = gridHeaderShowsLabel(column, visibleLabel);
  const sorted = sortDir != null;

  /**
   * ONE 16px mark slot, whatever the state.
   *
   * The header budget is inset (1rem) + mark (1rem) + label. Rendering the type
   * glyph AND a sort chevron needs a THIRD rem, which `UNBOXED` in a 5rem track
   * did not have — measured 93.6px into an 80px cell, clipping to `UNBO…`.
   *
   * Widening every sortable column instead would have cost a rem each, and
   * reserving the chevron unconditionally measured out as four more labels
   * (Date · Qty · Order · Tracking) collapsing to glyphs. So the chevron REUSES
   * the mark slot: while a column is sorted, the sort direction is the more
   * useful of the two marks — the data type is exactly what you already know
   * about a column you chose to sort by, and it returns when the sort moves on.
   *
   * Net: geometry is constant across sort states, no label ever clips, and no
   * label vanishes when the operator sorts.
   */
  const mark = sorted ? (
    sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
    ) : (
      <ChevronDown className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
    )
  ) : (
    glyph ?? (column.type ? <ColumnTypeGlyph type={column.type} className="h-3 w-3 text-text-soft" /> : null)
  );

  if (!showLabel) {
    return (
      <>
        {/* The column still has to be nameable to a screen reader when the
            visual label degrades to a mark. */}
        <span className="sr-only">{fullLabel}</span>
        {mark}
      </>
    );
  }

  return (
    <>
      {mark}
      <span className="min-w-0 truncate">{visibleLabel}</span>
    </>
  );
}

/**
 * `aria-sort` for a header cell: the active direction, `none` when the column
 * is sortable but inactive, and absent when it cannot sort at all.
 */
export function gridHeaderAriaSort(
  isActiveSort: boolean,
  sortDir: GridHeaderSortDir | null,
  sortable: boolean,
): 'ascending' | 'descending' | 'none' | undefined {
  if (isActiveSort && sortDir) return sortDir === 'asc' ? 'ascending' : 'descending';
  return sortable ? 'none' : undefined;
}
