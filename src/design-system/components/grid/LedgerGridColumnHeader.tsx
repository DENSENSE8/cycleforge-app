'use client';

/** Sticky LedgerGrid column-header row — the ONE header every table draws. */

import { useRef, useState, type ReactNode } from 'react';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import {
  GridRowCheckbox,
  isEmptyGutterChrome,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Pin, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives/IconButton';
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

/**
 * Header reorder arms only after the pointer actually travels. HTML5
 * `draggable` on the whole cell otherwise steals the click (Chrome starts a
 * drag at ~4px of jitter) and header sort reads as dead.
 */
const HEADER_REORDER_ARM_PX = 24;

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
import { gridFrozenLeft, gridFrozenRight, gridTemplate } from './grid-column-geometry';
import { gridHeaderCellAlignClass, resolveGridColumnAlign } from './grid-header-align';
import type { GridSortDir } from './grid-sort-dir';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

export type LedgerHeaderLayoutApi = {
  /** NOTE — there is deliberately no `template`, `cellClass`, `rowShellClass`, `frozenCellClass`, `frozenLeft` or `isFrozen` here. */
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
  /**
   * Freeze every column up to and including this one (the Sheets "freeze
   * through"); the current edge's pin unfreezes back to the default. Present ⇒
   * each header grows a hover pin. The layout owner writes it.
   */
  onFreezeColumn?: (key: string) => void;
  /** Runtime label override (e.g. Unbox stage → Unboxed / Scanned / Tested). */
  labelFor?: (column: C) => string | undefined;
  /**
   * Leading chrome for a `_paint` track (Unbox History click-select) — paint
   * bucket only. Ignored when the column list still has `select`.
   */
  leadingChrome?: ReactNode;
  /**
   * The check-set's verbs (Shopify index). Present ⇒ while ≥1 row is checked
   * the row BECOMES the bulk bar: the select-all check stays mounted (focus
   * holds on it), and the column labels give way to "N selected", these
   * verbs and Clear. Omit to keep the plain column header at every count.
   */
  bulkBar?: ReactNode;
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
  onFreezeColumn,
  labelFor,
  leadingChrome,
  bulkBar,
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
  // The bar hangs off the select track (focus stays on its check).
  const bulk = Boolean(bulkBar) && hasSelect && selectActive && selectedCount > 0;
  const selectedLabel = `${selectedCount} selected`;
  return (
    <div
      role="row"
      data-bulk-bar={bulk ? '' : undefined}
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
          // A `role="row"` may only own cell-family roles.
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
              // ## The select-all face is the FAMILY's chrome.
              // including in its mixed state. Operator 2026-09-04: port the
              chrome={selectGutterChrome === 'always' ? 'hover' : selectGutterChrome}
            />
          ) : (
            // Inert on a surface with no select-all (Tasks declares
            // `multiSelect: false`). Deliberately EMPTY rather than a ghost
            // check: a mark here would look like a control that does nothing.
            <span aria-hidden />
          )}
          {bulkBar && selectActive ? (
            // Always mounted so the count is ANNOUNCED as the bar swaps in and
            // out; the check keeps focus, so nothing else tells a reader.
            <span className="sr-only" role="status" aria-live="polite">
              {selectedCount > 0 ? selectedLabel : ''}
            </span>
          ) : null}
        </div>
      ) : null}

      {bulk ? (
        <div
          role="columnheader"
          aria-colspan={Math.max(1, dataColumns.length)}
          data-testid="data-table-bulk-bar"
          // Frozen like the check beside it: on a split-x sheet the header row
          // translates with the body and `.sticky` cells counter-translate, so
          // the verbs stay on screen after a horizontal scroll.
          className={cn(
            ledgerGridCell({ inset: 'none', rule: false }),
            LEDGER_HEADER_ROW_FACE,
            LEDGER_GRID_FROZEN_CELL,
            // Spans every data track after the check.
            'col-[2/-1] min-w-0 gap-2 pl-2',
          )}
        >
          <span
            className="mode-label shrink-0 whitespace-nowrap text-text-default"
            data-testid="data-table-bulk-count"
          >
            {selectedLabel}
          </span>
          <div className="flex min-w-0 items-center">{bulkBar}</div>
          <IconButton
            type="button"
            size="xs"
            radius="pill"
            tone="neutral"
            icon={<X className="h-3.5 w-3.5" aria-hidden />}
            ariaLabel="Clear selection"
            title="Clear selection"
            data-testid="data-table-bulk-clear"
            onClick={() => {
              if (selectionScope) emitToggleAll(selectionScope, 'none');
            }}
          />
        </div>
      ) : null}

      {bulk ? null : dataColumns.map((column, i) => {
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
            onFreezeColumn={onFreezeColumn}
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
  onFreezeColumn,
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
  onFreezeColumn?: (key: string) => void;
}) {
  const frozen = Boolean(column.frozen);
  const frozenEnd = Boolean(column.frozenEnd);
  const cellRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const didReorderRef = useRef(false);
  const [dragOver, setDragOver] = useState(false);
  /* A header is three affordances on one element, so each is claimed narrowly: */
  const reorderable =
    Boolean(onReorderColumn) &&
    !isGridColumnFillTrack(column) &&
    !isGridColumnPaintTrack(column) &&
    !frozenEnd &&
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
      onPointerDown={
        reorderable
          ? (event) => {
              if (event.button !== 0) return;
              const el = cellRef.current;
              originRef.current = { x: event.clientX, y: event.clientY };
              didReorderRef.current = false;
              el?.setAttribute('draggable', 'false');
              const move = (e: PointerEvent) => {
                const origin = originRef.current;
                if (!origin || !el) return;
                if (
                  Math.hypot(e.clientX - origin.x, e.clientY - origin.y) >=
                  HEADER_REORDER_ARM_PX
                ) {
                  el.setAttribute('draggable', 'true');
                }
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                originRef.current = null;
                if (!didReorderRef.current) el?.setAttribute('draggable', 'false');
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }
          : undefined
      }
      onDragStart={
        reorderable
          ? (event) => {
              didReorderRef.current = true;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', column.key);
            }
          : undefined
      }
      onDragEnd={
        reorderable
          ? () => {
              cellRef.current?.setAttribute('draggable', 'false');
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
      onClick={() => {
        if (didReorderRef.current) {
          didReorderRef.current = false;
          return;
        }
        onSort?.();
      }}
      className={cn(
        'group/hcell relative gap-1',
        LEDGER_HEADER_ROW_FACE,
        gridHeaderCellAlignClass(resolveGridColumnAlign(column)),
        // The two GUTTER tracks are flush in the body, so their headers must be
        // too — a `px-2` header over a zero-inset body column puts the sort
        // affordance and the column rule at different x than the cells under it.
        ledgerGridCell({ rule: !last, inset: flushTrack ? 'none' : 'grid' }),
        flushTrack && 'overflow-hidden p-0',
        (frozen || frozenEnd) && LEDGER_GRID_FROZEN_CELL,
        tableHeader,
        'text-text-default',
        sortActive && 'cursor-pointer',
        // Colour only — a drop marker that inset or moved the cell would
        // reflow the whole header row mid-drag (AGENTS.md: no layout tweens).
        dragOver && 'bg-surface-sunken',
      )}
      style={frozen ? { left: gridFrozenLeft(columns, column.key) } : frozenEnd ? { right: gridFrozenRight(columns, column.key) } : undefined}
    >
      <GridHeaderLabel
        column={column}
        sortDir={isActiveSort ? sortDir : null}
        sortable={sortActive}
      />
      {onFreezeColumn && !flushTrack && !frozenEnd ? (
        <HoverTooltip label={column.key === frozenEdgeKey ? 'Unfreeze columns' : 'Freeze through this column'} asChild>
          <IconButton
            ariaLabel={column.key === frozenEdgeKey ? 'Unfreeze columns' : `Freeze through ${label}`}
            data-freeze-column={column.key}
            onClick={(event) => {
              event.stopPropagation();
              onFreezeColumn(column.key);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className={cn(
              'ml-auto grid size-4 shrink-0 place-content-center text-text-faint hover:text-text-default',
              column.key === frozenEdgeKey ? 'text-text-muted' : 'opacity-0 group-hover/hcell:opacity-100',
            )}
            icon={<Pin aria-hidden className="size-3" />}
          />
        </HoverTooltip>
      ) : null}
      {resizable ? (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label}`}
          data-resize-grip
          onClick={(event) => event.stopPropagation()}
          // Double-click fits the column to its widest content (Sheets).
          onDoubleClick={(event) => {
            event.stopPropagation();
            const cell = cellRef.current;
            if (!cell) return;
            const fit = fitColumnWidth(cell, columns.indexOf(column));
            if (fit != null) onResizeColumn?.(column.key, Math.max(MIN_RESIZE_PX, fit));
          }}
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
            'absolute inset-y-0 right-0 z-raised w-1.5 cursor-col-resize',
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

/**
 * The width that shows a column's widest content in full: the header cell
 * and every rendered row's cell at `index` (rows are `[data-grid-row]`, one
 * child per column of the mounted model), each measured by its own content's
 * scroll width plus its padding. Virtualized rows not on screen are not
 * measured — the fit is to what the operator can see.
 */
function fitColumnWidth(headerCell: HTMLElement, index: number): number | null {
  let host: HTMLElement | null = headerCell.parentElement;
  while (host && !host.querySelector('[data-grid-row]')) host = host.parentElement;
  const cells: HTMLElement[] = [headerCell];
  for (const row of host?.querySelectorAll<HTMLElement>('[data-grid-row]') ?? []) {
    const cell = row.children[index];
    if (cell instanceof HTMLElement) cells.push(cell);
  }
  let widest = 0;
  for (const cell of cells) {
    const style = getComputedStyle(cell);
    const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    let content = 0;
    for (const el of cell.querySelectorAll<HTMLElement>('*')) content = Math.max(content, el.scrollWidth);
    widest = Math.max(widest, content + pad + 2);
  }
  return widest > 0 ? Math.ceil(widest) : null;
}
