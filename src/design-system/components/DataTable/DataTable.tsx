import { type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import type { ColumnType } from '@/lib/tables/table-columns';
import { tableHeader, tableCell } from '../../tokens/typography/presets';
import {
  TABLE_FROZEN_HEADER_CLASS,
  TABLE_SURFACE_CLIP_CLASS,
} from '../../tokens/table-surface';
import { resolveGridColumnAlign } from '../grid/grid-header-align';
import { TableStickyXScroll } from '../grid/TableStickyXScroll';
import { EmptyState } from '../../primitives/EmptyState';

// ─── DataTable ───────────────────────────────────────────────────────────────
//
// The canonical NON-VIRTUALIZED table: admin, settings, and reports lifecycle
// lists. Sibling of the `LedgerGrid` family, not a competitor — an ops queue
// that wants windowing, a frozen identity pane, per-staff Fields, or in-cell
// edit belongs on `LedgerGridSurface` with a `GridSurfaceDescriptor`. This is
// for the small read table that needs none of that.
//
// Token-first: surface shell is {@link TABLE_SURFACE_CLIP_CLASS} (rounded-xl +
// raised elevation); frozen header via {@link TABLE_FROZEN_HEADER_CLASS}.
// Typography from `tableHeader` / `tableCell`.
//
// Horizontal triage scroll uses {@link TableStickyXScroll} (client island) so
// this file stays free of `'use client'` — RSC admin pages keep zero client JS
// for static rows aside from that thin scroll chrome.
//
// **No `'use client'` on this file, deliberately.** This component holds no
// state of its own and most call sites (`/admin/inventory/**`, `/settings/audit`,
// …) are React Server Components. A directive here would put every one of them
// behind a client boundary — the bundle-altitude trap in `build-gotchas.md`.
// A caller that passes `onRowClick` is inherently interactive and must itself
// be a client component; React will say so plainly if a server component tries
// to hand over a function.

export type ColumnAlign = 'left' | 'center' | 'right';

export interface DataTableColumn<Row> {
  /** Stable key (also the React key for the header/cell). */
  key: string;
  /** Header label. */
  header: ReactNode;
  /** Cell renderer for a row. */
  cell: (row: Row) => ReactNode;
  /**
   * Data type — the SAME vocabulary the ledger grids use. Supply this and
   * alignment is DERIVED (`resolveGridColumnAlign`: digit / id / date tracks end,
   * word / tag tracks start) instead of hand-picked per column.
   *
   * This is the house justification law, and an admin table is exactly where it
   * used to drift: the wave this component is built for hand-types `text-right`
   * inside `cell()` on some numeric columns and forgets it on others, so two
   * count columns in the same table align differently.
   */
  type?: ColumnType;
  /**
   * Alignment OVERRIDE. Leave unset — `type` already decides. Set it only when a
   * column genuinely disagrees with its type's default, or for `center`, which
   * the typed vocabulary has no opinion about.
   */
  align?: ColumnAlign;
  /** Optional fixed/min width (CSS value, e.g. '140px'). */
  width?: string;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Stable row key. */
  rowKey: (row: Row, index: number) => string | number;
  /** Optional per-row click. Rows become buttons-in-spirit (hover + cursor). */
  onRowClick?: (row: Row) => void;
  /** Mark a row as the selected/active row. */
  isRowSelected?: (row: Row) => boolean;
  /** Sticky header (default true). */
  stickyHeader?: boolean;
  /**
   * Not settled yet — renders placeholder rows at the REAL column geometry
   * inside the framed shell, rather than letting the caller swap the table for a
   * spinner and reflow the page when data lands.
   */
  loading?: boolean;
  /** Rows to draw while `loading` (default 6). */
  loadingRows?: number;
  /**
   * Settled with nothing, because nothing exists yet. Distinct from
   * {@link searchEmptyMessage} — see the four settled states in
   * `display/workbench.md`. Telling an operator "nothing here yet" when a filter
   * excluded every row says their data is gone.
   */
  emptyMessage?: string;
  /** Settled with nothing because the active filter/search excluded everything. */
  searchEmptyMessage?: string;
  /** Is a search/filter currently narrowing the rows? Picks between the two above. */
  isSearching?: boolean;
  /** Full custom empty node — wins over both messages. */
  empty?: ReactNode;
  className?: string;
}

const ALIGN: Record<ColumnAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/** One alignment decision per column, shared with the ledger-grid SoT. */
function columnAlign<Row>(col: DataTableColumn<Row>): ColumnAlign {
  if (col.align) return col.align;
  if (!col.type) return 'left';
  return resolveGridColumnAlign({ type: col.type }) === 'end' ? 'right' : 'left';
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isRowSelected,
  stickyHeader = true,
  loading = false,
  loadingRows = 6,
  emptyMessage,
  searchEmptyMessage,
  isSearching = false,
  empty,
  className,
}: DataTableProps<Row>) {
  const alignFor = (col: DataTableColumn<Row>) => ALIGN[columnAlign(col)];

  const header = (
    <thead className={cn(stickyHeader && 'sticky top-0 z-sticky')}>
      <tr className={TABLE_FROZEN_HEADER_CLASS}>
        {columns.map((col) => (
          <th
            key={col.key}
            scope="col"
            style={col.width ? { width: col.width } : undefined}
            className={cn(
              tableHeader,
              'whitespace-nowrap border-b border-border-soft px-3 py-2.5',
              alignFor(col),
            )}
          >
            {col.header}
          </th>
        ))}
      </tr>
    </thead>
  );

  // Loading keeps the header + column widths so the table does not reflow when
  // the rows land. Pulse is pure CSS on purpose — `SkeletonList` is a client
  // component that pulls framer-motion, which would defeat the whole reason
  // this file has no `'use client'`.
  if (loading) {
    return (
      <div data-table-surface="" className={cn(TABLE_SURFACE_CLIP_CLASS, className)}>
        <TableStickyXScroll>
          <table className="w-full min-w-max border-collapse">
            {header}
            <tbody aria-busy="true">
              {Array.from({ length: loadingRows }, (_, i) => (
                <tr key={i} className="border-b border-border-soft last:border-b-0">
                  {columns.map((col) => (
                    <td key={col.key} className={cn(tableCell, 'px-3 py-2.5 align-middle')}>
                      <div className="h-3 w-full max-w-[10rem] animate-pulse rounded bg-surface-sunken" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableStickyXScroll>
      </div>
    );
  }

  if (rows.length === 0) {
    const message = isSearching
      ? (searchEmptyMessage ?? 'No rows match this filter.')
      : (emptyMessage ?? 'No rows to display.');
    return (
      <div data-table-surface="" className={cn(TABLE_SURFACE_CLIP_CLASS, className)}>
        {empty ?? (
          <EmptyState
            title={isSearching ? 'No matches' : 'Nothing here yet'}
            description={message}
          />
        )}
      </div>
    );
  }

  return (
    <div data-table-surface="" className={cn(TABLE_SURFACE_CLIP_CLASS, className)}>
      <TableStickyXScroll>
        <table className="w-full min-w-max border-collapse">
          {header}
          <tbody>
            {rows.map((row, index) => {
              const selected = isRowSelected?.(row) ?? false;
              const clickable = !!onRowClick;
              return (
                <tr
                  key={rowKey(row, index)}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-selected={isRowSelected ? selected : undefined}
                  className={cn(
                    'border-b border-border-soft last:border-b-0 transition-colors',
                    clickable &&
                      'cursor-pointer hover:bg-surface-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40',
                    selected && 'bg-surface-canvas',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(tableCell, 'px-3 py-2.5 align-middle', alignFor(col))}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableStickyXScroll>
    </div>
  );
}
