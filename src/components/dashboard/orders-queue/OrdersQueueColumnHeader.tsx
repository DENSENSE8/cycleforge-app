'use client';

import { GRID_HEADER_ROW_INDEX } from '@/design-system/components/grid/grid-row-index';
import { gridHeaderCellAlignClass, resolveGridColumnAlign } from '@/design-system/components/grid/grid-header-align';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Calendar, ChevronUp, ChevronDown } from '@/components/Icons';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { elevationClass } from '@/design-system/tokens/shadows';
import { TABLE_FROZEN_HEADER_CLASS } from '@/design-system/tokens/table-surface';
import { ColumnTypeGlyph } from '@/components/ui/table-column-config/column-type-glyph';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
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
import { ColumnResizeHandle } from './ColumnResizeHandle';
import { cn } from '@/utils/_cn';

/**
 * Sticky column header for the orders-queue WMS table — docks at scrollport top.
 * Pending Grid (`gridSkin`): adaptive label + type glyph (Airtable), taller bar,
 * tooltips = full labels; content-hard mins + `min-w-max` so h-scroll works.
 * Board / Packed: glyph + full text labels.
 *   select · product · date · age · qty · cond · order · tracking
 *
 * Header, body rows, and group summaries all map over ONE ordered `columns`
 * list (cell-renderer registry) — already RESOLVED to the visible tracks by
 * `useGridColumnVisibility` in the view — so the three can never disagree on
 * order, and a hidden column loses its TRACK instead of leaving a dead ruled
 * band. This header never re-asks "is this hidden?".
 * When `onReorderColumns` is provided (Pending grid), every column except the
 * locked pane (`select · title`) is drag-reorderable: whole-header-cell drag
 * (Airtable), house 6px pointer activation (SwimlaneBoard recipe), keyboard
 * path via dnd-kit's KeyboardSensor (Space lift · arrows move · Space drop).
 */
export function OrdersQueueColumnHeader({
  isMobile = false,
  selectMode = false,
  selectionScope,
  className,
  onResizeColumn,
  gridSkin = false,
  columns = ORDERS_QUEUE_COLUMNS,
  onReorderColumns,
  onResetColumnOrder,
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
  /**
   * Pending Grid view skin. Adaptive label+glyph taller header, always-visible
   * select-all, flush row chrome (cells own padding), content-min h-scroll.
   * Off → board/Packed header.
   */
  gridSkin?: boolean;
  /** Ordered VISIBLE column models (already sanitized + visibility-resolved).
   *  Default = canonical order. */
  columns?: readonly OrdersQueueColumn[];
  /**
   * Commit a new MOVABLE-column order after a header drag (locked keys are
   * re-prepended by the sanitizer). Presence enables drag-reorder.
   */
  onReorderColumns?: (nextMovable: OrdersQueueColumnKey[]) => void;
  /** Reset to canonical order — wired to double-click on a movable header
   *  cell; parent passes it only while a custom order is active. */
  onResetColumnOrder?: () => void;
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

  // dnd-kit: the house 6px pointer threshold (SwimlaneBoard) disambiguates
  // click vs drag; KeyboardSensor gives the Space/arrows reorder path.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isMobile) return null;

  const template = ordersQueueGridTemplateFor(columns);
  const dataColumns = columns.filter((c) => c.key !== 'select');
  // `columns` is already the RESOLVED visible list (`useGridColumnVisibility` in
  // the view), so every movable key here has a rendered header cell — sortable
  // targets and drop indices read the same list, with no second hidden-ness test.
  const sortableItems = columns.filter((c) => !isOrdersQueueFrozen(c.key)).map((c) => c.key);

  const onToggleAll = () => {
    if (!selectionScope || !selectActive) return;
    emitToggleAll(selectionScope, allSelected ? 'none' : 'all');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!onReorderColumns || !over || active.id === over.id) return;
    const oldIdx = sortableItems.indexOf(String(active.id) as OrdersQueueColumnKey);
    const newIdx = sortableItems.indexOf(String(over.id) as OrdersQueueColumnKey);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorderColumns(arrayMove([...sortableItems], oldIdx, newIdx));
  };

  const headerRow = (
    <div
      role="row"
      aria-rowindex={GRID_HEADER_ROW_INDEX}
      className={cn(
        // Sticky lives on LedgerGrid's `[data-grid-col-header]` wrapper so the
        // whole band freezes as one layer; this row fills that band.
        'group/hrow grid border-b border-border-default',
        gridSkin
          ? cn('min-h-11 px-0 py-0', TABLE_FROZEN_HEADER_CLASS)
          : cn('sticky top-0 z-sticky bg-surface-canvas/95 py-2 backdrop-blur-sm', ORDERS_QUEUE_COL_HEADER_STICKY, QUEUE_ROW.px),
        ordersQueueRowShellClass(false, { scrollMinContent: gridSkin }),
        className,
      )}
      style={{
        gridTemplateColumns: template,
      }}
    >
      {/* select — select-all only (grid); board may show grip elsewhere. Locked:
          never wrapped in a sortable, so drag listeners can't swallow clicks. */}
      <div
        className={cn(
          ordersQueueGridCell({ inset: 'none', rule: true }),
          'justify-center',
          ORDERS_QUEUE_FROZEN_CELL,
        )}
        style={{ left: ordersQueueFrozenLeft('select') }}
      >
        {selectActive && selectionScope ? (
          <button
            type="button"
            onClick={onToggleAll}
            aria-label={allSelected ? 'Deselect all' : 'Select all'}
            aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
            role="checkbox"
            className={cn(
              'ds-raw-button flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
              allSelected
                ? 'border-accent-bg bg-accent-bg text-text-inverse'
                : someSelected
                  ? 'border-accent-bg bg-accent-bg/20 text-accent-bg'
                  : 'border-border-default bg-surface-card hover:border-border-strong',
            )}
          >
            {allSelected ? <Check className="h-3 w-3" /> : someSelected ? (
              <span className="h-0.5 w-2 rounded-full bg-current" />
            ) : null}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden />
        )}
      </div>

      {dataColumns.map((column, i) => {
        const last = i === dataColumns.length - 1;
        const sortable = Boolean(onReorderColumns) && !isOrdersQueueFrozen(column.key);
        const sortActive = Boolean(onSortColumn) && isQueueColumnSort(column.key);
        const isActiveSort = activeSort === column.key;
        return sortable ? (
          <SortableHeaderCell
            key={column.key}
            column={column}
            last={last}
            gridSkin={gridSkin}
            onResize={onResizeColumn ? (px) => onResizeColumn(column.key, px) : undefined}
            onResetOrder={onResetColumnOrder}
            sortActive={sortActive}
            isActiveSort={isActiveSort}
            sortDir={isActiveSort ? sortDir : null}
            onSort={sortActive ? () => onSortColumn?.(column.key) : undefined}
          />
        ) : (
          <HeaderCell
            key={column.key}
            column={column}
            last={last}
            gridSkin={gridSkin}
            onResize={onResizeColumn ? (px) => onResizeColumn(column.key, px) : undefined}
            sortActive={sortActive}
            isActiveSort={isActiveSort}
            sortDir={isActiveSort ? sortDir : null}
            onSort={sortActive ? () => onSortColumn?.(column.key) : undefined}
          />
        );
      })}
    </div>
  );

  if (!onReorderColumns) return headerRow;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableItems} strategy={horizontalListSortingStrategy}>
        {headerRow}
      </SortableContext>
    </DndContext>
  );
}

/** Injected drag chrome for a reorderable header cell. */
interface HeaderCellDragProps {
  setNodeRef: (el: HTMLElement | null) => void;
  style: React.CSSProperties | undefined;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  isDragging: boolean;
}

/** Reorderable wrapper — whole-header-cell drag (no separate grip glyph; the
 *  6px activation distance does the click-vs-drag disambiguation). */
function SortableHeaderCell({
  column,
  last,
  gridSkin,
  onResize,
  onResetOrder,
  sortActive,
  isActiveSort,
  sortDir,
  onSort,
}: {
  column: OrdersQueueColumn;
  last: boolean;
  gridSkin: boolean;
  onResize?: (px: number) => void;
  onResetOrder?: () => void;
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: QueueDisplaySortDir | null;
  onSort?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.key,
  });
  return (
    <HeaderCell
      column={column}
      last={last}
      gridSkin={gridSkin}
      onResize={onResize}
      onResetOrder={onResetOrder}
      sortActive={sortActive}
      isActiveSort={isActiveSort}
      sortDir={sortDir}
      onSort={onSort}
      drag={{
        setNodeRef,
        style: {
          transform: transform ? CSS.Transform.toString(transform) : undefined,
          transition,
        },
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as unknown as Record<string, unknown> | undefined,
        isDragging,
      }}
    />
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
  gridSkin = false,
  drag,
  onResetOrder,
  sortActive = false,
  isActiveSort = false,
  sortDir = null,
  onSort,
}: {
  column: OrdersQueueColumn;
  last: boolean;
  onResize?: (px: number) => void;
  gridSkin?: boolean;
  drag?: HeaderCellDragProps;
  onResetOrder?: () => void;
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: QueueDisplaySortDir | null;
  onSort?: () => void;
}) {
  const label = column.label ?? column.key;
  const showTextLabel = gridSkin ? ordersQueueHeaderShowsLabel(column) : true;
  const visibleLabel = gridSkin ? (column.gridLabel ?? label) : label;
  const resizable = Boolean(onResize) && ORDERS_QUEUE_RESIZABLE_KEYS.includes(column.key);
  const frozen = isOrdersQueueFrozen(column.key);
  const cellInset = gridSkin ? 'grid' : 'cell';

  // Grid skin: every typed column shows its glyph; label only when the track fits.
  // Board look: glyph only on the roomy flexible (fr) columns — a glyph would
  // crowd the narrow fact columns' labels (skin-scoping guardrail).
  const showGlyph = gridSkin ? Boolean(column.type) : column.width.includes('fr');
  // Ship by = calendar (the commitment is a day, not a duration — the clock
  // glyph left with the retired Age column).
  const glyph = !showGlyph ? null :
    column.key === 'sla' ? (
      <Calendar className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : column.type ? (
      <ColumnTypeGlyph type={column.type} className={gridSkin ? 'h-3 w-3 text-text-faint' : undefined} />
    ) : null;

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

  const cell = (
    <div
      ref={drag?.setNodeRef}
      {...(drag ? { ...drag.attributes, ...drag.listeners } : {})}
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
        gridSkin && 'min-h-11',
        // Reorderable: whole-cell drag handle; keep touch scrolling from
        // hijacking the drag; lift the cell above siblings mid-drag.
        drag && 'cursor-grab touch-none select-none',
        sortActive && !drag && 'cursor-pointer',
        sortActive && 'hover:text-text-default',
        isActiveSort && 'text-text-default',
        drag?.isDragging && cn('z-raised cursor-grabbing bg-surface-card opacity-90', elevationClass('overlay')),
      )}
      style={{
        ...(frozen ? { left: ordersQueueFrozenLeft(column.key) } : {}),
        ...(drag?.style ?? {}),
      }}
      onClick={onSort}
      onDoubleClick={onResetOrder}
    >
      {inner}
      {resizable && onResize ? <ColumnResizeHandle colKey={column.key} label={label} onCommit={onResize} /> : null}
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
