'use client';

import { Check, GripVertical } from '@/components/Icons';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { useIsColumnHidden } from '@/components/ui/table-column-config/TableColumnConfig';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
import {
  ORDERS_QUEUE_COL_HEADER_STICKY,
  ordersQueueGridTemplate,
  ordersQueueRowShellClass,
} from '@/lib/dashboard-order-row-layout';
import { cn } from '@/utils/_cn';

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
}: {
  isMobile?: boolean;
  selectMode?: boolean;
  /** When set with selectMode, the lead checkbox drives select-all / clear. */
  selectionScope?: string;
  className?: string;
}) {
  const isHidden = useIsColumnHidden();
  const showQty = !isHidden('qty');
  const showCondition = !isHidden('condition');
  const scope = selectionScope ?? '__idle__';
  const selectedRows = useTableSelection<{ id?: number | string }>(scope, (r) => Number(r.id));
  const total = useTableSelectionTotal(scope);
  const selectedCount = selectionScope ? selectedRows.length : 0;
  const allSelected = Boolean(selectMode && selectionScope && total > 0 && selectedCount >= total);
  const someSelected = Boolean(selectMode && selectionScope && selectedCount > 0 && !allSelected);

  if (isMobile) return null;

  const template = ordersQueueGridTemplate();

  const onToggleAll = () => {
    if (!selectionScope || !selectMode) return;
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
      {/* select — micro drag grip (reorder affordance, header only) + select-all */}
      <div className="flex items-center gap-0.5">
        <HoverTooltip label="Drag to reorder" focusable={false}>
          <span
            className="inline-flex h-3 w-3 shrink-0 cursor-grab items-center justify-center text-text-faint active:cursor-grabbing"
            aria-hidden
          >
            <GripVertical className="h-3 w-3" />
          </span>
        </HoverTooltip>
        {selectMode && selectionScope ? (
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
          shifting every following header off its column). Label is SR-only. */}
      <div className="flex items-center justify-center">
        <span className="sr-only">Status</span>
      </div>

      <HeaderCell label="Product" />
      {showQty ? <HeaderCell label="Qty" /> : <span />}
      {showCondition ? <HeaderCell label="Cond" /> : <span />}
      <HeaderCell label="Age" />
      <HeaderCell label="Notes" />
      <HeaderCell label="Platform" />
      <HeaderCell label="Order" />
      <HeaderCell label="Tracking" />
    </div>
  );
}

function HeaderCell({ label }: { label: string }) {
  return (
    <div className={cn('flex min-w-0 items-center', tableHeader)}>
      <span className="truncate">{label}</span>
    </div>
  );
}
