'use client';

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
import { Check, Calendar, Clock } from '@/components/Icons';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { elevationClass } from '@/design-system/tokens/shadows';
import { useIsColumnHidden } from '@/components/ui/table-column-config/TableColumnConfig';
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
  ordersQueueGridTemplate,
  ordersQueueRowShellClass,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import { ColumnResizeHandle } from './ColumnResizeHandle';
import { cn } from '@/utils/_cn';

/**
 * Sticky column header for the orders-queue WMS table — docks at scrollport top.
 * Pending Grid (`gridSkin`): icon-only, taller bar, tooltips = full labels.
 * Board / Packed: glyph + text labels.
 *   select · product · date · age · qty · cond · stock · platform · order · tracking
 *
 * Header, body rows, and group summaries all map over ONE ordered `columns`
 * list (cell-renderer registry), so the three can never disagree on order.
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
}: {
  isMobile?: boolean;
  selectMode?: boolean;
  /** When set with selectMode, the lead checkbox drives select-all / clear. */
  selectionScope?: string;
  className?: string;
  /** Commit a column's drag-resized width (px). Presence enables the handles. */
  onResizeColumn?: (key: string, px: number) => void;
  /**
   * Pending Grid view skin. Icon-only taller header, always-visible select-all,
   * flush row chrome (cells own padding). Off → board/Packed header.
   */
  gridSkin?: boolean;
  /** Ordered column models (already sanitized). Default = canonical order. */
  columns?: readonly OrdersQueueColumn[];
  /**
   * Commit a new MOVABLE-column order after a header drag (locked keys are
   * re-prepended by the sanitizer). Presence enables drag-reorder.
   */
  onReorderColumns?: (nextMovable: OrdersQueueColumnKey[]) => void;
  /** Reset to canonical order — wired to double-click on a movable header
   *  cell; parent passes it only while a custom order is active. */
  onResetColumnOrder?: () => void;
}) {
  const isHidden = useIsColumnHidden();
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

  const template = ordersQueueGridTemplate(columns.map((c) => c.key));
  const dataColumns = columns.filter((c) => c.key !== 'select');
  const movableKeys = columns.filter((c) => !isOrdersQueueFrozen(c.key)).map((c) => c.key);
  // Sortable targets are the VISIBLE movable header cells; hidden columns keep
  // their key in `movableKeys` so a drop lands relative to the full order.
  const sortableItems = movableKeys.filter((k) => {
    const col = columns.find((c) => c.key === k);
    return !(col?.hideKey && isHidden(col.hideKey));
  });

  const onToggleAll = () => {
    if (!selectionScope || !selectActive) return;
    emitToggleAll(selectionScope, allSelected ? 'none' : 'all');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!onReorderColumns || !over || active.id === over.id) return;
    const oldIdx = movableKeys.indexOf(String(active.id) as OrdersQueueColumnKey);
    const newIdx = movableKeys.indexOf(String(over.id) as OrdersQueueColumnKey);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorderColumns(arrayMove([...movableKeys], oldIdx, newIdx));
  };

  const headerRow = (
    <div
      role="row"
      className={cn(
        // Sticky lives on LedgerGrid's `[data-grid-col-header]` wrapper so the
        // whole band freezes as one layer; this row fills that band.
        'group/hrow grid w-full border-b border-border-default bg-surface-card',
        gridSkin
          ? 'min-h-11 px-0 py-0'
          : cn('sticky top-0 z-sticky bg-surface-canvas/95 py-2 backdrop-blur-sm', ORDERS_QUEUE_COL_HEADER_STICKY, QUEUE_ROW.px),
        ordersQueueRowShellClass(false),
        className,
      )}
      style={{ gridTemplateColumns: template }}
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
        // Hideable columns collapse to an empty rule cell when hidden, so the
        // header stays locked to the body + the vertical rules stay continuous.
        if (column.hideKey && isHidden(column.hideKey)) {
          return (
            <span
              key={column.key}
              className={ordersQueueGridCell({ rule: !last, inset: gridSkin ? 'grid' : 'cell' })}
            />
          );
        }
        const sortable = Boolean(onReorderColumns) && !isOrdersQueueFrozen(column.key);
        return sortable ? (
          <SortableHeaderCell
            key={column.key}
            column={column}
            last={last}
            gridSkin={gridSkin}
            onResize={onResizeColumn ? (px) => onResizeColumn(column.key, px) : undefined}
            onResetOrder={onResetColumnOrder}
          />
        ) : (
          <HeaderCell
            key={column.key}
            column={column}
            last={last}
            gridSkin={gridSkin}
            onResize={onResizeColumn ? (px) => onResizeColumn(column.key, px) : undefined}
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
}: {
  column: OrdersQueueColumn;
  last: boolean;
  gridSkin: boolean;
  onResize?: (px: number) => void;
  onResetOrder?: () => void;
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
 * One header field. Grid skin: icon-only + tooltip label (never truncated text).
 * Board: glyph + visible label.
 */
function HeaderCell({
  column,
  last,
  onResize,
  gridSkin = false,
  drag,
  onResetOrder,
}: {
  column: OrdersQueueColumn;
  last: boolean;
  onResize?: (px: number) => void;
  gridSkin?: boolean;
  drag?: HeaderCellDragProps;
  onResetOrder?: () => void;
}) {
  const label = column.label ?? column.key;
  const resizable = Boolean(onResize) && ORDERS_QUEUE_RESIZABLE_KEYS.includes(column.key);
  const frozen = isOrdersQueueFrozen(column.key);
  const cellInset = gridSkin ? 'grid' : 'cell';

  // Grid skin: every typed column leads with its glyph (icon-only headers).
  // Board look: glyph only on the roomy flexible (fr) columns — a glyph would
  // crowd the narrow fact columns' labels (skin-scoping guardrail).
  const showGlyph = gridSkin ? Boolean(column.type) : column.width.includes('fr');
  // Date = calendar; Age = clock — both share ColumnType `date` otherwise.
  const glyph = !showGlyph ? null :
    column.key === 'date' ? (
      <Calendar className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
    ) : column.key === 'age' ? (
      <Clock className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
    ) : column.type ? (
      <ColumnTypeGlyph type={column.type} className={gridSkin ? 'h-3.5 w-3.5 text-text-muted' : undefined} />
    ) : null;

  const inner = gridSkin ? (
    <>
      <span className="sr-only">{label}</span>
      {glyph}
    </>
  ) : (
    <>
      {glyph}
      <span className="min-w-0 truncate">{label}</span>
    </>
  );

  const cell = (
    <div
      ref={drag?.setNodeRef}
      {...(drag ? { ...drag.attributes, ...drag.listeners } : {})}
      role="columnheader"
      data-col={column.key}
      data-frozen-edge={column.key === 'title' ? true : undefined}
      className={cn(
        'group/hcell relative justify-center',
        !gridSkin && glyph && 'gap-1',
        ordersQueueGridCell({ rule: !last, inset: cellInset }),
        frozen && ORDERS_QUEUE_FROZEN_CELL,
        tableHeader,
        gridSkin && 'min-h-11',
        // Reorderable: whole-cell drag handle; keep touch scrolling from
        // hijacking the drag; lift the cell above siblings mid-drag.
        drag && 'cursor-grab touch-none select-none',
        drag?.isDragging && cn('z-raised cursor-grabbing bg-surface-card opacity-90', elevationClass('overlay')),
      )}
      style={{
        ...(frozen ? { left: ordersQueueFrozenLeft(column.key) } : {}),
        ...(drag?.style ?? {}),
      }}
      onDoubleClick={onResetOrder}
    >
      {inner}
      {resizable && onResize ? <ColumnResizeHandle colKey={column.key} label={label} onCommit={onResize} /> : null}
    </div>
  );

  if (!gridSkin) return cell;
  return (
    <HoverTooltip label={label} focusable={false} asChild>
      {cell}
    </HoverTooltip>
  );
}
