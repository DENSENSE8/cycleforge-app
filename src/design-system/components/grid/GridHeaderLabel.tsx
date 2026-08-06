'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { ColumnTypeGlyph } from '@/components/ui/table-column-config/column-type-glyph';
import { gridHeaderShowsLabel } from './grid-column-geometry';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

type GridHeaderSortDir = 'asc' | 'desc';

/**
 * The INSIDE of a ledger grid column header: label (or glyph-only when the
 * track is too narrow / `headerGlyphOnly`) → optional sort chevron.
 *
 * Shared INNER label/chevron block. OUTER sticky row/cell chrome lives in
 * {@link LedgerGridColumnHeader} (Receiving / Incoming adapters; Orders still
 * deferred — resize/reorder recipe). Domain wrappers inject layout APIs +
 * glyph/label overrides; they must not re-fork this inner block.
 *
 * **Text-first (2026-08-04):** when the word fits, headers are **text only**
 * (+ sort chevron when active) — no decorative type glyph beside every title.
 * Type glyphs remain only for **glyph-only / narrow tracks** (`!showLabel`) or
 * an explicit `glyph` override. `gridHeaderShowsLabel` decides.
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
  /** Optional surface-specific mark; overrides the narrow-track type glyph. */
  glyph?: ReactNode;
  /** Non-null only when THIS column is the active sort. */
  sortDir?: GridHeaderSortDir | null;
}) {
  const fullLabel = label ?? column.label ?? column.key;
  const visibleLabel = label ?? column.gridLabel ?? column.label ?? column.key;
  const showLabel = gridHeaderShowsLabel(column, visibleLabel);
  const sorted = sortDir != null;

  /**
   * Mark slot:
   * - Sorted → chevron (reuses the slot so geometry stays constant).
   * - Explicit `glyph` → that mark.
   * - Glyph-only / narrow (`!showLabel`) → type glyph (Incoming golden).
   * - Text-visible headers → **no** decorative type glyph (Unbox History).
   */
  const typeMark =
    column.type != null ? (
      <ColumnTypeGlyph type={column.type} className="h-3 w-3 text-text-soft" />
    ) : null;

  const mark = sorted ? (
    sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
    ) : (
      <ChevronDown className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
    )
  ) : (
    glyph ?? (!showLabel ? typeMark : null)
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
