'use client';

import { GRID_HEADER_ROW_INDEX } from '@/design-system/components/grid/grid-row-index';
import { gridHeaderCellAlignClass, resolveGridColumnAlign } from '@/design-system/components/grid/grid-header-align';
import {
  gridTrackRemToPx,
  resolveGridColumnMinTrackRem,
} from '@/design-system/components/grid/grid-column-type-track';
import { useGridColumnWidthBoundsContext } from '@/design-system/components/grid/grid-column-width-bounds-context';
import { resolveColumnWidthClamp } from '@/components/ui/table-column-config/useColumnWidths';

import { ChevronUp, ChevronDown } from '@/components/Icons';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { TABLE_FROZEN_HEADER_CLASS } from '@/design-system/tokens/table-surface';
import { ColumnTypeGlyph } from '@/components/ui/table-column-config/column-type-glyph';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import {
  GridRowCheckbox,
  isEmptyGutterChrome,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
import { isGridColumnFillTrack } from '@/design-system/components/grid/grid-column-editability';
import {
  ORDERS_QUEUE_COL_HEADER_STICKY,
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_FROZEN_CELL,
  ORDERS_QUEUE_RESIZABLE_KEYS,
  isOrdersQueueFrozen,
  ordersQueueFrozenLeft,
  ordersQueueGridCell,
  ordersQueueGridTemplateFor,
  ordersQueueHeaderShowsLabel,
  ordersQueueRowShellClass,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import {
  isQueueColumnSort,
  type QueueDisplaySortColumn,
  type QueueDisplaySortDir,
} from '@/utils/queue-display-sort';
import { ColumnResizeHandle } from '@/design-system/components/grid/ColumnResizeHandle';
import {
  resolveColumnResizeEdges,
  type GridColumnResizeEdge,
} from '@/design-system/components/grid/grid-column-resize-edges';
import { cn } from '@/utils/_cn';

/**
 * Sticky column header for the orders-queue WMS table — docks at scrollport top.
 * Pending Grid (`gridSkin`): adaptive label + type glyph (Airtable), taller bar,
 * tooltips = full labels; content-hard mins + `min-w-max` so h-scroll works.
 * Board / Packed: glyph + full text labels.
 *
 * Header, body rows, and group summaries all map over ONE ordered `columns`
 * list (cell-renderer registry) — already RESOLVED to the visible tracks by
 * `useGridColumnVisibility` in the view — so the three can never disagree on
 * order, and a hidden column loses its TRACK instead of leaving a dead ruled
 * band. This header never re-asks "is this hidden?".
 *
 * Column order is pinned to the layout SoT (Unbox History parity) — no
 * drag-reorder. This fork remains for resize handles + viewport force-hide.
 */
export function OrdersQueueColumnHeader({
  isMobile = false,
  selectMode = false,
  selectionScope,
  className,
  onResizeColumn,
  onResetColumn,
  gridSkin = false,
  selectGutterChrome = 'always',
  columns = ORDERS_QUEUE_COLUMNS,
  activeSort,
  sortDir = null,
  onSortColumn,
}: {
  isMobile?: boolean;
  selectMode?: boolean;
  /** When set with selectMode, the lead checkbox drives select-all / clear. */
  selectionScope?: string;
  className?: string;
  /** Commit a column's drag-resized width (px). Presence enables the handles. */
  onResizeColumn?: (key: string, px: number) => void;
  /** Drop a column's persisted width (double-click grip → SoT default). */
  onResetColumn?: (key: string) => void;
  /**
   * Pending Grid view skin. Adaptive label+glyph taller header, always-visible
   * select-all, flush row chrome (cells own padding), content-min h-scroll.
   * Off → board/Packed header.
   */
  gridSkin?: boolean;
  /** Select-gutter face — To-ship uses `'always'` (painted checklist square). */
  selectGutterChrome?: GridSelectGutterChrome;
  /** Ordered VISIBLE column models (already visibility-resolved).
   *  Default = canonical order. */
  columns?: readonly OrdersQueueColumn[];
  /** Active column-sort key (URL `?sort=` when a data column). */
  activeSort?: QueueDisplaySortColumn;
  /** Active column-sort direction; null when not column-sorting. */
  sortDir?: QueueDisplaySortDir | null;
  /** Spreadsheet click-to-sort — Pending grid URL-driven mode only. */
  onSortColumn?: (key: OrdersQueueColumnKey) => void;
}) {
  const scope = selectionScope ?? '__idle__';
  const selectedRows = useTableSelection<{ id?: number | string }>(scope, (r) => Number(r.id));
  const total = useTableSelectionTotal(scope);
  const selectedCount = selectionScope ? selectedRows.length : 0;
  // In the grid skin, selection is always live (Airtable-style hover-select), so
  // select-all is armed without the pencil; the board still gates it on selectMode.
  const selectActive = selectMode || gridSkin;
  const allSelected = Boolean(selectActive && selectionScope && total > 0 && selectedCount >= total);
  const someSelected = Boolean(selectActive && selectionScope && selectedCount > 0 && !allSelected);

  if (isMobile) return null;

  const template = ordersQueueGridTemplateFor(columns);
  const dataColumns = columns.filter((c) => c.key !== 'select');
  const frozenEdgeKey = 'title';
  const resizeEdges = onResizeColumn
    ? resolveColumnResizeEdges(dataColumns, frozenEdgeKey)
    : null;

  const onToggleAll = () => {
    if (!selectionScope || !selectActive) return;
    emitToggleAll(selectionScope, allSelected ? 'none' : 'all');
  };

  return (
    <div
      role="row"
      aria-rowindex={GRID_HEADER_ROW_INDEX}
      className={cn(
        // Sticky lives on LedgerGrid's `[data-grid-col-header]` wrapper so the
        // whole band freezes as one layer; this row fills that band.
        'group/hrow grid border-b border-border-default',
        gridSkin
          ? cn('h-10 min-h-10 px-0 py-0', TABLE_FROZEN_HEADER_CLASS)
          : cn('sticky top-0 z-sticky bg-surface-canvas/95 py-2 backdrop-blur-sm', ORDERS_QUEUE_COL_HEADER_STICKY, QUEUE_ROW.px),
        ordersQueueRowShellClass(false, { scrollMinContent: gridSkin }),
        className,
      )}
      style={{
        gridTemplateColumns: template,
      }}
    >
      {/* select — select-all only (grid); board may show grip elsewhere. */}
      <div
        className={cn(
          ordersQueueGridCell({ inset: 'none', rule: true }),
          isEmptyGutterChrome(selectGutterChrome) ? 'items-stretch p-0' : 'justify-center',
          ORDERS_QUEUE_FROZEN_CELL,
        )}
        style={{ left: ordersQueueFrozenLeft('select') }}
      >
        {selectActive && selectionScope ? (
          <GridRowCheckbox
            checked={allSelected ? true : someSelected ? 'mixed' : false}
            onToggle={onToggleAll}
            label={allSelected ? 'Deselect all' : 'Select all'}
            chrome={selectGutterChrome}
          />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden />
        )}
      </div>

      {dataColumns.map((column, i) => {
        const last = i === dataColumns.length - 1;
        if (isGridColumnFillTrack(column)) {
          return (
            <div
              key={column.key}
              role="presentation"
              data-col={column.key}
              aria-hidden
              className={cn(
                gridSkin ? 'h-10 min-h-10' : 'h-10 min-h-10',
                ordersQueueGridCell({ rule: false, inset: 'none' }),
              )}
            />
          );
        }
        const sortActive = Boolean(onSortColumn) && isQueueColumnSort(column.key);
        const isActiveSort = activeSort === column.key;
        const edges =
          onResizeColumn && ORDERS_QUEUE_RESIZABLE_KEYS.includes(column.key)
            ? (resizeEdges?.get(column.key) ?? ['end'])
            : undefined;
        const onResize = edges && onResizeColumn
          ? (px: number) => onResizeColumn(column.key, px)
          : undefined;
        const onReset = edges && onResetColumn
          ? () => onResetColumn(column.key)
          : undefined;
        return (
          <HeaderCell
            key={column.key}
            column={column}
            last={last}
            gridSkin={gridSkin}
            onResize={onResize}
            onReset={onReset}
            resizeEdges={edges}
            frozenEdgeKey={frozenEdgeKey}
            sortActive={sortActive}
            isActiveSort={isActiveSort}
            sortDir={isActiveSort ? sortDir : null}
            onSort={sortActive ? () => onSortColumn?.(column.key) : undefined}
          />
        );
      })}
    </div>
  );
}

/**
 * One header field. Grid skin: adaptive short label + type glyph when the track
 * is wide enough ({@link ordersQueueHeaderShowsLabel}); otherwise glyph-only +
 * sr-only + tooltip (never truncated `A…`). Board: glyph + visible full label.
 */
function HeaderCell({
  column,
  last,
  onResize,
  onReset,
  resizeEdges,
  frozenEdgeKey = 'title',
  gridSkin = false,
  sortActive = false,
  isActiveSort = false,
  sortDir = null,
  onSort,
}: {
  column: OrdersQueueColumn;
  last: boolean;
  onResize?: (px: number) => void;
  onReset?: () => void;
  resizeEdges?: readonly GridColumnResizeEdge[];
  frozenEdgeKey?: string;
  gridSkin?: boolean;
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: QueueDisplaySortDir | null;
  onSort?: () => void;
}) {
  const label = column.label ?? column.key;
  const showTextLabel = gridSkin ? ordersQueueHeaderShowsLabel(column) : true;
  const visibleLabel = gridSkin ? (column.gridLabel ?? label) : label;
  const frozen = isOrdersQueueFrozen(column.key);
  const cellInset = gridSkin ? 'grid' : 'cell';

  // Grid skin: text (+ sort chevron) by default — type glyphs only when the
  // track is too narrow for its label (SoT: GridHeaderLabel). Board look: glyph
  // only on the roomy flexible (fr) columns.
  const showGlyph = gridSkin ? !showTextLabel : column.width.includes('fr');
  const glyph = !showGlyph || !column.type ? null : (
    <ColumnTypeGlyph type={column.type} className={gridSkin ? 'h-3 w-3 text-text-faint' : undefined} />
  );

  const sortChevron = isActiveSort && sortDir ? (
    sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
    ) : (
      <ChevronDown className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
    )
  ) : null;

  const inner = gridSkin && !showTextLabel ? (
    <>
      <span className="sr-only">{label}</span>
      {glyph}
      {sortChevron}
    </>
  ) : (
    <>
      {glyph}
      <span className="min-w-0 truncate">{visibleLabel}</span>
      {sortChevron}
    </>
  );

  const ariaSort =
    isActiveSort && sortDir
      ? sortDir === 'asc'
        ? 'ascending'
        : 'descending'
      : sortActive
        ? 'none'
        : undefined;

  const widthBoundsByKey = useGridColumnWidthBoundsContext();
  const minTrackRem = resolveGridColumnMinTrackRem(column);
  const typedFloorPx = minTrackRem > 0 ? gridTrackRemToPx(minTrackRem) : undefined;
  const bound = widthBoundsByKey[column.key];
  const { minPx: minWidthPx, maxPx: maxWidthPx } = resolveColumnWidthClamp({
    typedFloorPx,
    staffMin: bound?.min,
    staffMax: bound?.max,
  });

  const cell = (
    <div
      role="columnheader"
      data-col={column.key}
      data-frozen-edge={column.key === 'title' ? true : undefined}
      aria-sort={ariaSort}
      className={cn(
        'group/hcell relative',
        // Every header aligns with its data (SoT) — numeric / id / date / tracking
        // tracks resolve `end`; prose / tag / external stay `start`.
        gridSkin ? cn(gridHeaderCellAlignClass(resolveGridColumnAlign(column)), 'gap-1') : 'justify-center',
        !gridSkin && glyph && 'gap-1',
        ordersQueueGridCell({ rule: !last, inset: cellInset }),
        frozen && ORDERS_QUEUE_FROZEN_CELL,
        tableHeader,
        gridSkin && 'h-10 min-h-10',
        sortActive && 'cursor-pointer hover:text-text-default',
        isActiveSort && 'text-text-default',
      )}
      style={frozen ? { left: ordersQueueFrozenLeft(column.key) } : undefined}
      onClick={onSort}
    >
      {inner}
      {onResize && onReset && resizeEdges
        ? resizeEdges.map((edge) => (
            <ColumnResizeHandle
              key={edge}
              colKey={column.key}
              label={label}
              onCommit={onResize}
              onReset={onReset}
              edge={edge}
              flush={edge === 'end' && column.key === frozenEdgeKey}
              minWidthPx={minWidthPx}
              maxWidthPx={maxWidthPx}
            />
          ))
        : null}
    </div>
  );

  if (!gridSkin) return cell;
  const tip = isActiveSort && sortDir
    ? `${label} · sorted ${sortDir === 'asc' ? 'A→Z / ascending' : 'Z→A / descending'}`
    : sortActive
      ? `${label} · click to sort`
      : label;
  return (
    <HoverTooltip label={tip} focusable={false} asChild>
      {cell}
    </HoverTooltip>
  );
}
