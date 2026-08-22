'use client';

/**
 * Sticky LedgerGrid column-header row — shared outer chrome for Receiving /
 * Incoming / Pickup / Catalog / Repair. Inner label/chevron lives in
 * {@link GridHeaderLabel}; this owns select-all, frozen tracks, sort click,
 * aria-sort, HoverTooltip tips, and the optional per-column drag-resize grip.
 *
 * Column DISPLAY is not here: its control lives in a gutter beside the card
 * ({@link GridColumnGutter}), because a control parked at the band's right edge
 * either reserves a permanent track or covers the last column's label.
 *
 * Domain wrappers supply a {@link LedgerHeaderLayoutApi} + optional glyph /
 * label overrides. Resize / reorder stay out of v1 (Orders header fork).
 */

import { type ReactNode } from 'react';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import {
  GridRowCheckbox,
  isEmptyGutterChrome,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
import { cn } from '@/utils/_cn';

/** Primary chrome row — LedgerGrid header / select / fact cells. One seam height. */
const LEDGER_HEADER_ROW_FACE = PRIMARY_CHROME_ROW_FACE;
import { ColumnResizeHandle } from './ColumnResizeHandle';
import { GridHeaderLabel, gridHeaderAriaSort } from './GridHeaderLabel';
import {
  isGridColumnResizable,
  isGridColumnFillTrack,
  isGridColumnFlushTrack,
  isGridColumnPaintTrack,
} from './grid-column-editability';
import { gridFrozenLeft } from './grid-column-geometry';
import {
  resolveColumnResizeEdges,
  type GridColumnResizeEdge,
} from './grid-column-resize-edges';
import { gridHeaderCellAlignClass, resolveGridColumnAlign } from './grid-header-align';
import type { GridSortDir } from './grid-sort-dir';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';
import { resolveColumnWidthClamp } from '@/components/ui/table-column-config/useColumnWidths';
import { useGridColumnWidthBoundsContext } from './grid-column-width-bounds-context';
import {
  gridTrackRemToPx,
  resolveGridColumnMinTrackRem,
} from './grid-column-type-track';
import {
  LedgerGridColumnContextMenu,
  type LedgerGridColumnMenuApi,
} from './LedgerGridColumnContextMenu';


export type LedgerHeaderLayoutApi<C extends LedgerGridColumnModel> = {
  template: (cols: readonly C[]) => string;
  cellClass: (opts: { inset: 'none' | 'grid'; rule: boolean }) => string;
  rowShellClass: (isMobile: boolean, opts?: { scrollMinContent?: boolean }) => string;
  frozenCellClass: string;
  /**
   * NOTE — there is deliberately no `frozenLeft` / `isFrozen` here.
   *
   * Both used to be family closures over the family's FLAT column constant, and
   * the header called them by key. That silently broke the moment a family
   * mounted a SECOND column model: Receiving's compound layout freezes
   * `select · thumb`, but `isReceivingGridFrozen` answered for `select · order`,
   * so the pinned photo track resolved `left` as if it were the first frozen
   * column and pinned on top of the checkbox under horizontal scroll.
   *
   * The header already receives the columns actually mounted. Freeze membership
   * (`column.frozen`) and the sticky offset (`gridFrozenLeft(columns, key)`) now
   * derive from THAT array, so a header cannot disagree with the model beneath
   * it — whichever model a surface swaps in.
   */
  isSortable: (key: string) => boolean;
  /** Column key that draws `data-frozen-edge`. Default `title`. */
  frozenEdgeKey?: string;
};

export type LedgerGridColumnHeaderProps<C extends LedgerGridColumnModel> = {
  columns: readonly C[];
  layout: LedgerHeaderLayoutApi<C>;
  isMobile?: boolean;
  selectMode?: boolean;
  selectionScope?: string;
  /**
   * Select-all chrome. Defaults to `'always'`. Unbox History / Incoming /
   * Orders sheets pass `'sheets'` — full-cell hit plane; paints
   * {@link GridClickSelectFace} when all/mixed so top-left matches body checks.
   */
  selectGutterChrome?: GridSelectGutterChrome;
  className?: string;
  activeSort?: string | null;
  sortDir?: GridSortDir | null;
  onSortColumn?: (key: string) => void;
  /** Runtime label override (e.g. Unbox stage → Unboxed / Scanned / Tested). */
  labelFor?: (column: C) => string | undefined;
  /**
   * Commit a column's drag-resized width (px). Presence enables the grips on
   * every resizable track ({@link isGridColumnResizable} — variable-content
   * columns; not `select`, and not fixed-format `number` tracks).
   */
  onResizeColumn?: (key: string, px: number) => void;
  /**
   * Drop a column's persisted width (SoT default). Wired with
   * {@link onResizeColumn}; double-click / Enter on the grip call it.
   */
  onResetColumn?: (key: string) => void;
  /**
   * Sheets-class header context menu. When set, every data header cell wraps
   * in {@link LedgerGridColumnContextMenu}.
   */
  columnMenu?: LedgerGridColumnMenuApi<C>;
  /**
   * Leading chrome for a `_paint` track (Unbox History click-select) — paint
   * bucket only. Ignored when the column list still has `select`.
   */
  leadingChrome?: ReactNode;
};

export function LedgerGridColumnHeader<C extends LedgerGridColumnModel>({
  columns,
  layout,
  isMobile = false,
  selectMode = false,
  selectionScope,
  selectGutterChrome = 'always',
  className,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  labelFor,
  onResizeColumn,
  onResetColumn,
  columnMenu,
  leadingChrome,
}: LedgerGridColumnHeaderProps<C>) {
  const widthBoundsByKey = useGridColumnWidthBoundsContext();
  const scope = selectionScope ?? '__idle__';
  const selectedRows = useTableSelection<{ id?: number | string }>(scope, (r) => Number(r.id));
  const total = useTableSelectionTotal(scope);
  const selectedCount = selectionScope ? selectedRows.length : 0;
  const selectActive = Boolean(selectMode && selectionScope);
  const allSelected = Boolean(selectActive && total > 0 && selectedCount >= total);
  const someSelected = Boolean(selectActive && selectedCount > 0 && !allSelected);

  if (isMobile) return null;

  const hasSelect = columns.some((c) => c.key === 'select');
  // The compound row's gutters are flush and its select-all shares the body's
  // face. Probed from the MOUNTED model — never a prop, so a header cannot
  // disagree with the cells beneath it.
  const compoundModel = columns.some((c) => isGridColumnFlushTrack(c) && c.key === 'thumb');
  const template = layout.template(columns);
  const dataColumns = columns.filter((c) => c.key !== 'select');
  // The frozen edge IS the last frozen track, so derive it from the MOUNTED
  // model. A family constant (`RECEIVING_GRID_FROZEN_EDGE_KEY = 'order'`) names
  // a key the compound model does not have, so the scroll-edge shadow simply
  // never painted on a compound table — the same class of bug as the sticky
  // offsets above, and the same fix. `layout.frozenEdgeKey` remains the
  // fallback for a model with no frozen tracks at all.
  const frozenEdgeKey =
    [...columns].reverse().find((c) => c.frozen)?.key ?? layout.frozenEdgeKey ?? 'title';
  const resizeEdges = onResizeColumn
    ? resolveColumnResizeEdges(dataColumns, frozenEdgeKey)
    : null;

  const onToggleAll = () => {
    if (!selectionScope || !selectActive) return;
    emitToggleAll(selectionScope, allSelected ? 'none' : 'all');
  };

  const emptyGutter = isEmptyGutterChrome(selectGutterChrome);

  return (
    <div
      role="row"
      className={cn(
        'group/hrow grid border-b border-border-default bg-surface-card px-0 py-0',
        LEDGER_HEADER_ROW_FACE,
        layout.rowShellClass(false, { scrollMinContent: true }),
        className,
      )}
      style={{ gridTemplateColumns: template }}
    >
      {hasSelect ? (
        <div
          className={cn(
            layout.cellClass({ inset: 'none', rule: true }),
            LEDGER_HEADER_ROW_FACE,
            emptyGutter ? 'items-stretch overflow-hidden p-0' : 'justify-center',
            layout.frozenCellClass,
          )}
          style={{ left: gridFrozenLeft(columns, 'select') }}
          data-frozen-edge={frozenEdgeKey === 'select' ? true : undefined}
        >
          {selectActive ? (
            <GridRowCheckbox
              checked={allSelected ? true : someSelected ? 'mixed' : false}
              onToggle={onToggleAll}
              label={allSelected ? 'Deselect all' : 'Select all'}
              // Under a compound model the select-all must be the SAME face the
              // body rows below it paint, or the top-left control is a 16px
              // square sitting over a column of 48px flush checkmarks. The
              // model decides; a mount cannot pass a face that disagrees.
              chrome={compoundModel ? 'flush' : selectGutterChrome}
            />
          ) : (
            // Inert on a surface with no select-all (Tasks declares
            // `multiSelect: false`). Deliberately EMPTY rather than a ghost
            // check: a mark here would look like a control that does nothing.
            <span aria-hidden />
          )}
        </div>
      ) : null}

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
                LEDGER_HEADER_ROW_FACE,
                layout.cellClass({ rule: false, inset: 'none' }),
              )}
            />
          );
        }
        if (isGridColumnPaintTrack(column)) {
          return (
            <div
              key={column.key}
              data-col={column.key}
              className={cn(
                layout.cellClass({ inset: 'none', rule: true }),
                'flex items-center justify-center',
                LEDGER_HEADER_ROW_FACE,
              )}
            >
              {leadingChrome ?? <span className="h-4 w-4 shrink-0" aria-hidden />}
            </div>
          );
        }
        const sortable = Boolean(onSortColumn) && layout.isSortable(column.key);
        const isActiveSort = activeSort === column.key;
        const labelOverride = labelFor?.(column);
        const headerColumn =
          labelOverride != null
            ? ({ ...column, label: labelOverride, gridLabel: labelOverride } as C)
            : column;
        const edges =
          onResizeColumn && isGridColumnResizable(column)
            ? (resizeEdges?.get(column.key) ?? ['end'])
            : undefined;
        return (
          <LedgerHeaderCell
            key={column.key}
            column={headerColumn}
            last={last}
            layout={layout}
            columns={columns}
            frozenEdgeKey={frozenEdgeKey}
            sortActive={sortable}
            isActiveSort={isActiveSort}
            sortDir={isActiveSort ? sortDir : null}
            onSort={sortable ? () => onSortColumn?.(column.key) : undefined}
            resizeEdges={edges}
            onResize={
              edges && onResizeColumn
                ? (px) => onResizeColumn(column.key, px)
                : undefined
            }
            onReset={
              edges && onResetColumn
                ? () => onResetColumn(column.key)
                : undefined
            }
            columnMenu={columnMenu}
            widthBound={widthBoundsByKey[column.key]}
          />
        );
      })}
    </div>
  );
}

function LedgerHeaderCell<C extends LedgerGridColumnModel>({
  column,
  last,
  layout,
  frozenEdgeKey,
  columns,
  sortActive = false,
  isActiveSort = false,
  sortDir = null,
  onSort,
  onResize,
  onReset,
  resizeEdges,
  columnMenu,
  widthBound,
}: {
  column: C;
  last: boolean;
  layout: LedgerHeaderLayoutApi<C>;
  frozenEdgeKey: string;
  /** The MOUNTED model — freeze membership and sticky offsets derive from it. */
  columns: readonly C[];
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: GridSortDir | null;
  onSort?: () => void;
  onResize?: (px: number) => void;
  onReset?: () => void;
  resizeEdges?: readonly GridColumnResizeEdge[];
  columnMenu?: LedgerGridColumnMenuApi<C>;
  widthBound?: { min?: number; max?: number };
}) {
  const frozen = Boolean(column.frozen);
  const flushTrack = isGridColumnFlushTrack(column);
  const label = column.label ?? column.key;
  const ariaSort = gridHeaderAriaSort(isActiveSort, sortDir, sortActive);
  const tip =
    isActiveSort && sortDir
      ? `${label} · sorted ${sortDir === 'asc' ? 'A→Z / ascending' : 'Z→A / descending'}`
      : sortActive
        ? `${label} · click to sort · right-click for more`
        : `${label} · right-click for column options`;
  const minTrackRem = resolveGridColumnMinTrackRem(column);
  const typedFloorPx = minTrackRem > 0 ? gridTrackRemToPx(minTrackRem) : undefined;
  const { minPx: minWidthPx, maxPx: maxWidthPx } = resolveColumnWidthClamp({
    typedFloorPx,
    staffMin: widthBound?.min,
    staffMax: widthBound?.max,
  });

  const cell = (
    <div
      role="columnheader"
      data-col={column.key}
      data-frozen-edge={column.key === frozenEdgeKey ? true : undefined}
      aria-sort={ariaSort}
      onClick={onSort}
      className={cn(
        'group/hcell relative gap-1',
        LEDGER_HEADER_ROW_FACE,
        gridHeaderCellAlignClass(resolveGridColumnAlign(column)),
        // The two GUTTER tracks are flush in the body, so their headers must be
        // too — a `px-2` header over a zero-inset body column puts the sort
        // affordance and the column rule at different x than the cells under it.
        layout.cellClass({ rule: !last, inset: flushTrack ? 'none' : 'grid' }),
        flushTrack && 'overflow-hidden p-0',
        frozen && layout.frozenCellClass,
        tableHeader,
        sortActive && 'cursor-pointer hover:text-text-default',
        isActiveSort && 'text-text-default',
      )}
      style={frozen ? { left: gridFrozenLeft(columns, column.key) } : undefined}
    >
      <GridHeaderLabel column={column} sortDir={isActiveSort ? sortDir : null} />
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

  const tipped = (
    <HoverTooltip label={tip} focusable={false} asChild>
      {cell}
    </HoverTooltip>
  );

  if (!columnMenu) return tipped;

  return (
    <LedgerGridColumnContextMenu column={column} menu={columnMenu}>
      {tipped}
    </LedgerGridColumnContextMenu>
  );
}
