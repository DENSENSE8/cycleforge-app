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
 * All five `*GridColumnHeader` components carried this block byte-identically,
 * along with the label-resolution and `aria-sort` ternaries. Only the OUTER
 * cell differs per surface (its `*GridCell` class, frozen offset, and sticky
 * behaviour), so that is deliberately left with each header — extracting the
 * whole component would have forced five genuinely different chrome shapes
 * through one prop bag, which is the trade that makes shared components worse
 * than the duplication they replace.
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

  const resolvedGlyph =
    glyph ?? (column.type ? <ColumnTypeGlyph type={column.type} className="h-3 w-3 text-text-faint" /> : null);

  const chevron = sortDir ? (
    sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
    ) : (
      <ChevronDown className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
    )
  ) : null;

  if (!showLabel) {
    return (
      <>
        {/* The column still has to be nameable to a screen reader when the
            visual label degrades to a glyph. */}
        <span className="sr-only">{fullLabel}</span>
        {resolvedGlyph}
        {chevron}
      </>
    );
  }

  return (
    <>
      {resolvedGlyph}
      <span className="min-w-0 truncate">{visibleLabel}</span>
      {chevron}
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
