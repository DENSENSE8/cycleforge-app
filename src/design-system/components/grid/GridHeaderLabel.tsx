'use client';

import { ChevronDown, ChevronUp } from '@/components/Icons';
import { ColumnTypeGlyph } from './column-type-glyph';
import { gridHeaderShowsLabel } from './grid-column-geometry';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';
import { cn } from '@/utils/_cn';

type GridHeaderSortDir = 'asc' | 'desc';

const SORT_MARK_CLASS = 'h-3 w-3 shrink-0';

/**
 * The INSIDE of a ledger grid column header: label (or glyph-only when the
 * track is too narrow / `headerGlyphOnly`) → optional sort arrow to the RIGHT
 * of the title, only while this column is the active sort.
 *
 * Shared INNER label/chevron block. OUTER sticky row/cell chrome lives in
 * {@link LedgerGridColumnHeader}.
 *
 * **Text-first (2026-08-04):** when the word fits, headers are **text only**
 * — no decorative type glyph beside every title. Type glyphs remain only for
 * **glyph-only / narrow tracks** (`!showLabel`).
 *
 * **Sort mark (2026-09-01):** the chevron sits to the right of the title and
 * appears only while THIS column is sorted (`ChevronUp` / `ChevronDown`).
 * Idle sortable headers are the title alone. The title itself is
 * `text-text-default` so it cannot inherit muted chrome gray.
 */
export function GridHeaderLabel({
  column,
  label,
  sortDir = null,
  sortable = false,
}: {
  column: LedgerGridColumnModel;
  /**
   * Runtime label override — Unbox swaps `stage` to `Unboxed` / `Scanned` /
   * `Tested`. Passed through to the fit test so the track is measured against
   * the word actually rendered.
   */
  label?: string;
  /** Non-null only when THIS column is the active sort. */
  sortDir?: GridHeaderSortDir | null;
  /** When true and `sortDir` is set, the chevron sits to the right of the title. */
  sortable?: boolean;
}) {
  const fullLabel = label ?? column.label ?? column.key;
  const visibleLabel = label ?? column.gridLabel ?? column.label ?? column.key;
  const showLabel = gridHeaderShowsLabel(column, visibleLabel);

  /**
   * Glyph-only / narrow (`!showLabel`) → the type glyph. Text-visible headers
   * never carry a decorative type mark (text-first).
   */
  const typeMark =
    !showLabel && column.type != null ? (
      <ColumnTypeGlyph type={column.type} className="h-3 w-3 text-text-default" />
    ) : null;

  const sortMark =
    !sortable || !sortDir ? null : sortDir === 'asc' ? (
      <span data-sort-affordance="asc" className="inline-flex shrink-0">
        <ChevronUp className={`${SORT_MARK_CLASS} text-text-default`} aria-hidden />
      </span>
    ) : (
      <span data-sort-affordance="desc" className="inline-flex shrink-0">
        <ChevronDown className={`${SORT_MARK_CLASS} text-text-default`} aria-hidden />
      </span>
    );

  if (!showLabel) {
    const center = column.key === 'thumb' || column.type === 'image';
    return (
      <span className={cn('inline-flex items-center', center && 'w-full justify-center')}>
        <span className="sr-only">{fullLabel}</span>
        {typeMark}
        {sortMark}
      </span>
    );
  }

  return (
    <>
      <span className="min-w-0 truncate font-semibold text-text-default">{visibleLabel}</span>
      {sortMark}
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
