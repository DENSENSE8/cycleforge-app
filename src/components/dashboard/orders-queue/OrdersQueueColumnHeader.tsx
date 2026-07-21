'use client';

import { Check, GripVertical } from '@/components/Icons';
import { tableHeader } from '@/design-system/tokens/typography/presets';
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
} from '@/lib/dashboard-order-row-layout';
import { ColumnResizeHandle } from './ColumnResizeHandle';
import { cn } from '@/utils/_cn';

/** The labelled data columns (everything past the select + status gutters). */
const DATA_COLUMNS = ORDERS_QUEUE_COLUMNS.filter((c) => c.key !== 'select' && c.key !== 'status');

/**
 * Sticky column header for the orders-queue WMS table — docks ABOVE day bands.
 * One text label per track, locked to {@link OrdersQueueTableRow} column-for-column:
 *   select · status · product · qty · cond · age · notes · platform · order · tracking
 * The drag grip lives ONLY here (select-all context); rows carry the checkbox alone.
 */
export function OrdersQueueColumnHeader({
  isMobile = false,
  selectMode = false,
  selectionScope,
  className,
  onResizeColumn,
  gridSkin = false,
}: {
  isMobile?: boolean;
  selectMode?: boolean;
  /** When set with selectMode, the lead checkbox drives select-all / clear. */
  selectionScope?: string;
  className?: string;
  /** Commit a column's drag-resized width (px). Presence enables the handles. */
  onResizeColumn?: (key: string, px: number) => void;
  /**
   * Airtable grid-view skin. Leads EVERY typed column with its type glyph (not
   * only the roomy flex columns) and keeps the select-all checkbox available even
   * when the pencil is off, dropping the per-column drag grip — the spreadsheet
   * gutter shows selection, not reorder. Off → the plain board header.
   */
  gridSkin?: boolean;
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

  if (isMobile) return null;

  const template = ordersQueueGridTemplate();

  const onToggleAll = () => {
    if (!selectionScope || !selectActive) return;
    emitToggleAll(selectionScope, allSelected ? 'none' : 'all');
  };

  return (
    <div
      role="row"
      className={cn(
        'sticky z-sticky grid border-b border-border-soft bg-surface-canvas/95 backdrop-blur-sm',
        ORDERS_QUEUE_COL_HEADER_STICKY,
        QUEUE_ROW.px,
        'py-2',
        ordersQueueRowShellClass(false),
        className,
      )}
      style={{ gridTemplateColumns: template }}
    >
      {/* select — micro drag grip (reorder affordance, header only) + select-all.
          Lead control gutter: no inset, no column rule (status carries the rule
          before the title). */}
      <div
        className={cn(
          ordersQueueGridCell({ inset: 'none', rule: false }),
          gridSkin ? 'justify-center' : 'gap-0.5',
          ORDERS_QUEUE_FROZEN_CELL,
        )}
        style={{ left: ordersQueueFrozenLeft('select') }}
      >
        {gridSkin ? null : (
          <HoverTooltip label="Drag to reorder" focusable={false}>
            <span
              className="inline-flex h-3 w-3 shrink-0 cursor-grab items-center justify-center text-text-faint active:cursor-grabbing"
              aria-hidden
            >
              <GripVertical className="h-3 w-3" />
            </span>
          </HoverTooltip>
        )}
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

      {/* status — dot column; keep an in-flow cell so the track stays (a bare
          `sr-only` span is position:absolute and would drop out of the grid,
          shifting every following header off its column). Label is SR-only.
          Carries the first column rule (before the title). */}
      <div
        role="columnheader"
        className={cn(ordersQueueGridCell({ inset: 'none' }), 'justify-center', ORDERS_QUEUE_FROZEN_CELL)}
        style={{ left: ordersQueueFrozenLeft('status') }}
      >
        <span className="sr-only">Status</span>
      </div>

      {DATA_COLUMNS.map((column, i) => {
        const last = i === DATA_COLUMNS.length - 1;
        // Hideable columns collapse to an empty rule cell when hidden, so the
        // header stays locked to the body + the vertical rules stay continuous.
        if (column.hideKey && isHidden(column.hideKey)) {
          return <span key={column.key} className={ordersQueueGridCell({ rule: !last })} />;
        }
        return (
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
}

/**
 * One header field: type glyph (roomy columns only) + label + a right-edge drag
 * resize handle (data columns), locked to the body via {@link ordersQueueGridCell}
 * + `data-col` so header ↔ cell alignment is glyph-agnostic. `last` drops the
 * trailing rule on the final (tracking) column.
 *
 * Board look: the glyph renders only on the flexible (roomy) columns —
 * Product / Notes — since a glyph would crowd the narrow fact columns' labels.
 * Airtable grid skin (`gridSkin`): every typed column leads with its glyph (the
 * label still follows, so the shared `#`/tag glyphs stay unambiguous), for the
 * icon-first spreadsheet header.
 */
function HeaderCell({
  column,
  last,
  onResize,
  gridSkin = false,
}: {
  column: OrdersQueueColumn;
  last: boolean;
  onResize?: (px: number) => void;
  gridSkin?: boolean;
}) {
  const label = column.label ?? column.key;
  const showGlyph = gridSkin ? Boolean(column.type) : column.width.includes('fr');
  const resizable = Boolean(onResize) && ORDERS_QUEUE_RESIZABLE_KEYS.includes(column.key);
  const frozen = isOrdersQueueFrozen(column.key);
  return (
    <div
      role="columnheader"
      data-col={column.key}
      data-frozen-edge={column.key === 'title' ? true : undefined}
      className={cn(
        'group/hcell relative',
        showGlyph && 'gap-1',
        ordersQueueGridCell({ rule: !last }),
        frozen && ORDERS_QUEUE_FROZEN_CELL,
        tableHeader,
      )}
      style={frozen ? { left: ordersQueueFrozenLeft(column.key) } : undefined}
    >
      {showGlyph && column.type ? <ColumnTypeGlyph type={column.type} /> : null}
      <span className="min-w-0 truncate">{label}</span>
      {resizable && onResize ? <ColumnResizeHandle colKey={column.key} label={label} onCommit={onResize} /> : null}
    </div>
  );
}
