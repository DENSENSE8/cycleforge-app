'use client';

/**
 * Sticky LedgerGrid column-header row — the ONE header every table draws.
 *
 * It owns select-all, frozen tracks, sort click, aria-sort and HoverTooltip
 * tips. The inner label/chevron lives in {@link GridHeaderLabel}.
 *
 * ## What is deliberately not here any more
 *
 * Drag-resize grips, the right-click column menu and the column-display rail
 * were deleted 2026-08-29 (`docs/todo/one-table-sot-teardown-HANDOFF.md` § 4.2).
 * They were the interactive layer that made a header a surface each desk could
 * fork; the header is now geometry + sort + select-all and nothing else. If a
 * verb earns its way back it comes back once, here, asked for.
 *
 * Callers reach this through {@link DataTable}, which draws it from the
 * binding's columns — no page supplies header chrome.
 */

import { useRef, useState, type ReactNode } from 'react';
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

/**
 * Narrowest a drag-resize may make a column.
 *
 * Not zero: a track dragged to nothing is unrecoverable without a reset, since
 * the grip lives on the edge that just disappeared.
 */
const MIN_RESIZE_PX = 48;

/** Primary chrome row — LedgerGrid header / select / fact cells. One seam height. */
const LEDGER_HEADER_ROW_FACE = PRIMARY_CHROME_ROW_FACE;
import {
  LEDGER_GRID_FROZEN_CELL,
  ledgerGridCell,
  ledgerGridRowShellClass,
} from './grid-cell-chrome';
import { GridHeaderLabel, gridHeaderAriaSort } from './GridHeaderLabel';
import {
  isGridColumnFillTrack,
  isGridColumnFlushTrack,
  isGridColumnPaintTrack,
  isGridColumnResizable,
} from './grid-column-editability';
import { gridFrozenLeft, gridTemplate } from './grid-column-geometry';
import { gridHeaderCellAlignClass, resolveGridColumnAlign } from './grid-header-align';
import type { GridSortDir } from './grid-sort-dir';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

export type LedgerHeaderLayoutApi = {
  /**
   * NOTE — there is deliberately no `template`, `cellClass`, `rowShellClass`,
   * `frozenCellClass`, `frozenLeft` or `isFrozen` here.
   *
   * All six were per-family fields, and five of them were the SAME shared
   * function under a family-flavoured alias: every layout module re-exported
   * `gridTemplate`, `ledgerGridCell`, `ledgerGridRowShellClass` and
   * `LEDGER_GRID_FROZEN_CELL` as `receivingGridTemplate`, `tasksGridCell`,
   * `dailyGridRowShellClass` and so on. Six declarations of one answer is a
   * fork whether or not the bodies match today — it is a rename, not a
   * decision, and it gives six places for the next fix to miss.
   *
   * What is left is the one field that genuinely differs per surface: which
   * columns offer click-to-sort.
   *
   * Freeze membership (`column.frozen`) and the sticky offset
   * (`gridFrozenLeft(columns, key)`) derive from the MOUNTED array, so a header
   * cannot disagree with the model beneath it — whichever model a surface
   * swaps in.
   */
  isSortable: (key: string) => boolean;
  /** Column key that draws `data-frozen-edge`. Default `title`. */
  frozenEdgeKey?: string;
};

export type LedgerGridColumnHeaderProps<C extends LedgerGridColumnModel> = {
  columns: readonly C[];
  layout: LedgerHeaderLayoutApi;
  isMobile?: boolean;
  selectMode?: boolean;
  selectionScope?: string;
  /**
   * Select-all chrome. Defaults to `'always'`. Sheets surfaces pass `'sheets'`
   * — full-cell hit plane, so top-left matches the body checks.
   */
  selectGutterChrome?: GridSelectGutterChrome;
  className?: string;
  activeSort?: string | null;
  sortDir?: GridSortDir | null;
  onSortColumn?: (key: string) => void;
  /**
   * Drop a dragged column before/at another column's position. Present ⇒ the
   * header cells become draggable handles. The header does NOT own the column
   * array — it reports the intent and the layout owner writes it.
   */
  onReorderColumn?: (dragKey: string, dropKey: string) => void;
  /**
   * Commit a drag-resized width in px for one column. Present ⇒ resizable
   * columns grow a right-edge grip.
   */
  onResizeColumn?: (key: string, widthPx: number) => void;
  /** Runtime label override (e.g. Unbox stage → Unboxed / Scanned / Tested). */
  labelFor?: (column: C) => string | undefined;
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
  onReorderColumn,
  onResizeColumn,
  labelFor,
  leadingChrome,
}: LedgerGridColumnHeaderProps<C>) {
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
  const template = gridTemplate(columns);
  const dataColumns = columns.filter((c) => c.key !== 'select');
  // The frozen edge IS the last frozen track, so derive it from the MOUNTED
  // model. `layout.frozenEdgeKey` remains the fallback for a model with no
  // frozen tracks at all.
  const frozenEdgeKey =
    [...columns].reverse().find((c) => c.frozen)?.key ?? layout.frozenEdgeKey ?? 'title';

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
        ledgerGridRowShellClass(false, { scrollMinContent: true }),
        className,
      )}
      style={{ gridTemplateColumns: template }}
    >
      {hasSelect ? (
        <div
          // A `role="row"` may only own cell-family roles. Without this the
          // wrapper is a generic element, ARIA flattens it, and the
          // `role="checkbox"` inside `GridRowCheckbox` becomes a direct child
          // of the row — which is what failed axe `aria-required-children`
          // ("Element has children which are not allowed: [role=checkbox]")
          // and cost the To-ship desk 10 Accessibility points. This is the
          // header row, so the select gutter is a `columnheader`.
          role="columnheader"
          className={cn(
            ledgerGridCell({ inset: 'none', rule: true }),
            LEDGER_HEADER_ROW_FACE,
            emptyGutter ? 'items-stretch overflow-hidden p-0' : 'justify-center',
            LEDGER_GRID_FROZEN_CELL,
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
                ledgerGridCell({ rule: false, inset: 'none' }),
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
                ledgerGridCell({ inset: 'none', rule: true }),
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
        return (
          <LedgerHeaderCell
            key={column.key}
            column={headerColumn}
            last={last}
            columns={columns}
            frozenEdgeKey={frozenEdgeKey}
            sortActive={sortable}
            isActiveSort={isActiveSort}
            sortDir={isActiveSort ? sortDir : null}
            onSort={sortable ? () => onSortColumn?.(column.key) : undefined}
            onReorderColumn={onReorderColumn}
            onResizeColumn={onResizeColumn}
          />
        );
      })}
    </div>
  );
}

function LedgerHeaderCell<C extends LedgerGridColumnModel>({
  column,
  last,
  frozenEdgeKey,
  columns,
  sortActive = false,
  isActiveSort = false,
  sortDir = null,
  onSort,
  onReorderColumn,
  onResizeColumn,
}: {
  column: C;
  last: boolean;
  frozenEdgeKey: string;
  /** The MOUNTED model — freeze membership and sticky offsets derive from it. */
  columns: readonly C[];
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: GridSortDir | null;
  onSort?: () => void;
  onReorderColumn?: (dragKey: string, dropKey: string) => void;
  onResizeColumn?: (key: string, widthPx: number) => void;
}) {
  const frozen = Boolean(column.frozen);
  const cellRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  /*
   * A header is three affordances on one element, so each is claimed narrowly:
   *
   *  - CLICK sorts (unchanged),
   *  - DRAG on the cell reorders,
   *  - DRAG on the right-edge grip resizes.
   *
   * The grip stops propagation on pointer-down so a resize never starts a
   * reorder, and the reorder's own drag suppresses the click that would
   * otherwise fire a sort on drop. Structural tracks (`select`, `_fill`,
   * paint) never reorder — they are chrome, not facts.
   */
  const reorderable =
    Boolean(onReorderColumn) &&
    !isGridColumnFillTrack(column) &&
    !isGridColumnPaintTrack(column) &&
    column.key !== 'select';
  const resizable = Boolean(onResizeColumn) && isGridColumnResizable(column);
  const flushTrack = isGridColumnFlushTrack(column);
  const label = column.label ?? column.key;
  const ariaSort = gridHeaderAriaSort(isActiveSort, sortDir, sortActive);
  const tip =
    isActiveSort && sortDir
      ? `${label} · sorted ${sortDir === 'asc' ? 'A→Z / ascending' : 'Z→A / descending'}`
      : sortActive
        ? `${label} · click to sort`
        : label;

  const cell = (
    <div
      ref={cellRef}
      draggable={reorderable || undefined}
      onDragStart={
        reorderable
          ? (event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', column.key);
            }
          : undefined
      }
      onDragOver={
        reorderable
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={reorderable ? () => setDragOver(false) : undefined}
      onDrop={
        reorderable
          ? (event) => {
              event.preventDefault();
              setDragOver(false);
              const dragKey = event.dataTransfer.getData('text/plain');
              if (dragKey && dragKey !== column.key) onReorderColumn?.(dragKey, column.key);
            }
          : undefined
      }
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
        ledgerGridCell({ rule: !last, inset: flushTrack ? 'none' : 'grid' }),
        flushTrack && 'overflow-hidden p-0',
        frozen && LEDGER_GRID_FROZEN_CELL,
        tableHeader,
        sortActive && 'cursor-pointer hover:text-text-default',
        isActiveSort && 'text-text-default',
        // Colour only — a drop marker that inset or moved the cell would
        // reflow the whole header row mid-drag (AGENTS.md: no layout tweens).
        dragOver && 'bg-surface-sunken',
      )}
      style={frozen ? { left: gridFrozenLeft(columns, column.key) } : undefined}
    >
      <GridHeaderLabel column={column} sortDir={isActiveSort ? sortDir : null} />
      {resizable ? (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label}`}
          data-resize-grip
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            // Never let a resize start a sort or a reorder.
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const startW = cellRef.current?.getBoundingClientRect().width ?? 0;
            const move = (e: PointerEvent) => {
              const next = Math.max(MIN_RESIZE_PX, startW + (e.clientX - startX));
              onResizeColumn?.(column.key, Math.round(next));
            };
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
          className={cn(
            'absolute inset-y-0 right-0 z-raised w-1 cursor-col-resize',
            'opacity-0 transition-opacity group-hover/hcell:opacity-100',
            'bg-border-default',
          )}
        />
      ) : null}
    </div>
  );

  return (
    <HoverTooltip label={tip} focusable={false} asChild>
      {cell}
    </HoverTooltip>
  );
}
