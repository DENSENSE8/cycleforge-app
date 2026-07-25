'use client';

import { Fragment, memo, useState, type ReactNode } from 'react';
import { CollapsibleGroupRow } from '@/components/ui/CollapsibleGroupRow';
import { OrderIdChip, getLast4 } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateCellValue } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import type { RowGroup } from '@/lib/group-rows';
import { formatDateKeyShort } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { pickupMoney, type PickupLine } from '../pickup-lines';
import {
  PICKUP_GRID_COLUMNS,
  PICKUP_GRID_FROZEN_CELL,
  pickupGridCell,
  pickupGridFrozenLeft,
  pickupGridRowShellClass,
  pickupGridTemplate,
  type PickupGridColumn,
} from './pickup-grid-layout';

const dataCell = (rule = true) => pickupGridCell({ rule, inset: 'grid' });

/** Amber (Draft) / emerald (Done) status dot + chip tone. */
function statusIsDone(orderStatus: string): boolean {
  return orderStatus === 'COMPLETED';
}

function pickupDateLabel(dateKey: string | null): string | null {
  return dateKey ? formatDateKeyShort(dateKey) : null;
}

function StatusChip({ orderStatus }: { orderStatus: string }) {
  const done = statusIsDone(orderStatus);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-role-micro font-black uppercase tracking-widest ring-1 ring-inset',
        done
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-amber-50 text-amber-700 ring-amber-200',
      )}
    >
      {done ? 'Done' : 'Draft'}
    </span>
  );
}

/**
 * One pickup product line — CSS-grid columns matching {@link PICKUP_GRID_COLUMNS}.
 * Read-only: no inline editor, no serial/stage clock (those are receiving-only).
 */
const PickupGridLeafRow = memo(function PickupGridLeafRow({
  line,
  index,
  isSelected,
  onSelectOrder,
  columns = PICKUP_GRID_COLUMNS,
}: {
  line: PickupLine;
  index: number;
  isSelected: boolean;
  onSelectOrder: (orderId: number) => void;
  columns?: readonly PickupGridColumn[];
}) {
  const done = statusIsDone(line.order_status);
  const condGrade = (line.condition_grade || '').toUpperCase();
  const dateLabel = pickupDateLabel(line.pickup_date);

  const renderCell = (col: PickupGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              pickupGridCell({ inset: 'none', rule: true }),
              PICKUP_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: pickupGridFrozenLeft('select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(rule), PICKUP_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: pickupGridFrozenLeft('title') }}
            data-frozen-edge
          >
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', done ? 'bg-emerald-500' : 'bg-amber-400')}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {line.product_title}
            </span>
          </div>
        );
      case 'sku':
        return (
          <div data-col="sku" className={dataCell(rule)}>
            {line.sku ? (
              <span className="min-w-0 truncate font-mono text-role-caption text-text-soft">
                {line.sku}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'order':
        return (
          <div data-col="order" className={dataCell(rule)}>
            {line.po_number ? (
              <OrderIdChip
                value={line.po_number}
                display={getLast4(line.po_number)}
                plain
                truncateDisplay={false}
                fitDisplayWidth
              />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'date':
        return (
          <div data-col="date" className={dataCell(rule)}>
            <GridDateCellValue label={dateLabel} tooltip={line.pickup_date} className="text-role-caption" />
          </div>
        );
      case 'qty':
        return (
          <div data-col="qty" className={cn(dataCell(rule), 'justify-end')}>
            <span className="min-w-0 truncate tabular-nums text-role-caption text-text-muted">
              {line.quantity}
            </span>
          </div>
        );
      case 'condition':
        return (
          <div data-col="condition" className={dataCell(rule)}>
            <span
              className={cn(
                'min-w-0 truncate text-role-eyebrow uppercase',
                conditionGradeTextClass(condGrade),
              )}
            >
              {conditionLabel(line.condition_grade, 'compact')}
            </span>
          </div>
        );
      case 'price':
        return (
          <div data-col="price" className={cn(dataCell(rule), 'justify-end')}>
            <span className="tabular-nums text-role-caption font-bold text-emerald-700">
              {pickupMoney(line.total_price)}
            </span>
          </div>
        );
      case 'status':
        return (
          <div data-col="status" className={dataCell(rule)}>
            <StatusChip orderStatus={line.order_status} />
          </div>
        );
      default:
        return <span className={dataCell(rule)} />;
    }
  };

  return (
    <div
      data-pickup-row-id={line.id}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Local pickup line ${line.product_title}`}
      onClick={() => onSelectOrder(line.order_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectOrder(line.order_id);
        }
      }}
      className={cn(
        pickupGridRowShellClass(false, { scrollMinContent: true }),
        'cursor-pointer border-b border-border-hairline px-0 py-0 transition-colors hover:bg-surface-hover',
        isSelected
          ? QUEUE_ROW.selectedClass
          : index % 2 === 1
            ? 'bg-surface-canvas'
            : 'bg-surface-card',
      )}
      style={{ gridTemplateColumns: pickupGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});

/**
 * Collapsed multi-item order header — same tracks as {@link PickupGridLeafRow}.
 * The title cell condenses the order (PO# · customer); qty/price roll up the
 * fold; condition shows a single grade or MIXED.
 */
function PickupGridGroupSummary({
  group,
  onSelectOrder,
  columns = PICKUP_GRID_COLUMNS,
}: {
  group: RowGroup<PickupLine>;
  onSelectOrder: (orderId: number) => void;
  columns?: readonly PickupGridColumn[];
}) {
  const first = group.rows[0];
  const totalQty = group.rows.reduce((sum, r) => sum + r.quantity, 0);
  const totalValue = group.rows.reduce((sum, r) => sum + (Number(r.total_price) || 0), 0);
  const grades = new Set(group.rows.map((r) => (r.condition_grade || '').toUpperCase()).filter(Boolean));
  const condGrade = grades.size === 1 ? [...grades][0] : '';
  const condDisplay = grades.size === 1 ? conditionLabel([...grades][0], 'compact') : grades.size > 1 ? 'MIXED' : '—';
  const done = statusIsDone(first.order_status);
  const dateLabel = pickupDateLabel(first.pickup_date);
  const customer = first.customer_name;

  const renderCell = (col: PickupGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              pickupGridCell({ inset: 'none', rule: true }),
              PICKUP_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: pickupGridFrozenLeft('select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(rule), PICKUP_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: pickupGridFrozenLeft('title') }}
            data-frozen-edge
          >
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', done ? 'bg-emerald-500' : 'bg-amber-400')}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-role-data font-bold text-text-default">
              {first.po_number || `Order ${first.order_id}`}
            </span>
            {customer ? (
              <span className="min-w-0 shrink truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                {customer}
              </span>
            ) : null}
            <span className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro font-black uppercase tracking-widest text-text-soft">
              {group.rows.length} item{group.rows.length === 1 ? '' : 's'}
            </span>
          </div>
        );
      case 'sku':
        return <div data-col="sku" className={dataCell(rule)}><GridCellDash /></div>;
      case 'order':
        return (
          <div data-col="order" className={dataCell(rule)}>
            {first.po_number ? (
              <OrderIdChip
                value={first.po_number}
                display={getLast4(first.po_number)}
                plain
                truncateDisplay={false}
                fitDisplayWidth
              />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'date':
        return (
          <div data-col="date" className={dataCell(rule)}>
            <GridDateCellValue label={dateLabel} tooltip={first.pickup_date} className="text-role-caption" />
          </div>
        );
      case 'qty':
        return (
          <div data-col="qty" className={cn(dataCell(rule), 'justify-end')}>
            <span className="min-w-0 truncate tabular-nums text-role-caption font-black text-text-muted">
              {totalQty}
            </span>
          </div>
        );
      case 'condition':
        return (
          <div data-col="condition" className={dataCell(rule)}>
            <span className={cn('min-w-0 truncate text-role-eyebrow uppercase', conditionGradeTextClass(condGrade))}>
              {condDisplay}
            </span>
          </div>
        );
      case 'price':
        return (
          <div data-col="price" className={cn(dataCell(rule), 'justify-end')}>
            <span className="tabular-nums text-role-caption font-black text-emerald-700">
              {pickupMoney(String(totalValue))}
            </span>
          </div>
        );
      case 'status':
        return (
          <div data-col="status" className={dataCell(rule)}>
            <StatusChip orderStatus={first.order_status} />
          </div>
        );
      default:
        return <span className={dataCell(rule)} />;
    }
  };

  return (
    <HoverTooltip label={`Open order ${first.po_number || first.order_id}`} focusable={false} asChild>
      <div
        data-grid-summary-row=""
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onSelectOrder(first.order_id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onSelectOrder(first.order_id);
          }
        }}
        className={cn(pickupGridRowShellClass(false, { scrollMinContent: true }), 'cursor-pointer px-0')}
        style={{ gridTemplateColumns: pickupGridTemplate(columns) }}
      >
        {columns.map((col, i) => (
          <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
        ))}
      </div>
    </HoverTooltip>
  );
}

/**
 * One LCPU order inside the pickup LedgerGrid. Singleton → plain leaf;
 * multi-item → collapsible order summary + child product rows (the first-class
 * one-to-many fold).
 */
export function PickupGridGroupRow({
  group,
  baseStripeIndex,
  selectedOrderId,
  onSelectOrder,
  columns = PICKUP_GRID_COLUMNS,
}: {
  group: RowGroup<PickupLine>;
  baseStripeIndex: number;
  selectedOrderId: number | null;
  onSelectOrder: (orderId: number) => void;
  columns?: readonly PickupGridColumn[];
}) {
  const orderId = group.rows[0]?.order_id ?? null;
  const isOrderSelected = orderId != null && orderId === selectedOrderId;
  const [expanded, setExpanded] = useState(isOrderSelected);
  const isMulti = group.rows.length > 1;

  const renderLeaf = (line: PickupLine, stripeIndex: number): ReactNode => (
    <PickupGridLeafRow
      key={line.id}
      line={line}
      index={stripeIndex}
      isSelected={isOrderSelected}
      onSelectOrder={onSelectOrder}
      columns={columns}
    />
  );

  if (!isMulti) {
    return <>{renderLeaf(group.rows[0], baseStripeIndex)}</>;
  }

  return (
    <CollapsibleGroupRow
      index={baseStripeIndex}
      showChevron={false}
      nestRail={false}
      expanded={expanded}
      onToggle={setExpanded}
      summary={<PickupGridGroupSummary group={group} onSelectOrder={onSelectOrder} columns={columns} />}
    >
      {group.rows.map((line, i) => renderLeaf(line, baseStripeIndex + 1 + i))}
    </CollapsibleGroupRow>
  );
}
