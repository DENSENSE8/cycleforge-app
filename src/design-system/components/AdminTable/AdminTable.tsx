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

// ─── AdminTable ───────────────────────────────────────────────────────────────

export type ColumnAlign = 'left' | 'center' | 'right';

export interface AdminTableColumn<Row> {
  /** Stable key (also the React key for the header/cell). */
  key: string;
  /** Header label. */
  header: ReactNode;
  /** Cell renderer for a row. */
  cell: (row: Row) => ReactNode;
  /** Data type — the SAME vocabulary the ledger grids use. */
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

interface AdminTableProps<Row> {
  columns: AdminTableColumn<Row>[];
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
  /** Settled with nothing, because nothing exists yet. */
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
function columnAlign<Row>(col: AdminTableColumn<Row>): ColumnAlign {
  if (col.align) return col.align;
  if (!col.type) return 'left';
  return resolveGridColumnAlign({ type: col.type }) === 'end' ? 'right' : 'left';
}

export function AdminTable<Row>({
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
}: AdminTableProps<Row>) {
  const alignFor = (col: AdminTableColumn<Row>) => ALIGN[columnAlign(col)];

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

  // Loading keeps the header + column widths so the table does not reflow when the rows land.
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
