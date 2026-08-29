'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import {
  GridCellDash,
  GridDateCellValue,
  GridStatusCellValue,
} from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { PICKUP_GRID_CAPABILITIES } from '@/components/receiving/pickup/grid/pickup-grid-descriptor';
import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import type { RowGroup } from '@/lib/group-rows';
import {
  pickupOrderStatusChipClass,
  pickupOrderStatusDot,
  pickupOrderStatusLabel,
} from '@/lib/local-pickup/order-status';
import { formatDateKeyShort } from '@/utils/date';
import { gridCellAlignClass } from '@/design-system/components/grid';
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

const dataCell = (col: PickupGridColumn, rule = true) =>
  cn(pickupGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

function pickupDateLabel(dateKey: string | null): string | null {
  return dateKey ? formatDateKeyShort(dateKey) : null;
}

/**
 * The order's state — dot + chip through the house {@link GridStatusCellValue}
 * (2026-08-02). The dot is the same `pickupOrderStatusDot` that used to lead the
 * TITLE cell; it belongs here, in the column that owns the fact, where it can be
 * sorted, hidden and resized with its own kind.
 */
function PickupStatusChip({
  orderStatus,
  receivingId,
}: {
  orderStatus: string;
  receivingId?: number | null;
}) {
  const opts = { receivingId: receivingId ?? null };
  return (
    <GridStatusCellValue
      label={pickupOrderStatusLabel(orderStatus, opts)}
      toneClass={pickupOrderStatusChipClass(orderStatus, opts)}
      dotClass={pickupOrderStatusDot(orderStatus, opts)}
    />
  );
}

/**
 * One pickup product line — CSS-grid columns matching {@link PICKUP_GRID_COLUMNS}.
 * Read-only: no inline editor, no serial/stage clock (those are receiving-only).
 */
const PickupGridLeafRow = memo(function PickupGridLeafRow({
  line,
  isSelected,
  onSelectOrder,
  columns = PICKUP_GRID_COLUMNS,
}: {
  line: PickupLine;
  isSelected: boolean;
  onSelectOrder: (orderId: number) => void;
  columns?: readonly PickupGridColumn[];
}) {
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
            className={cn(dataCell(col, rule), PICKUP_GRID_FROZEN_CELL)}
            style={{ left: pickupGridFrozenLeft('title') }}
            data-frozen-edge
          >
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {line.product_title}
            </span>
          </div>
        );
      case 'sku':
        return (
          <div data-col="sku" className={dataCell(col, rule)}>
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
          <div data-col="order" className={dataCell(col, rule)}>
            <OrderIdChip
              value={line.po_number || ''}
              display={getLast8(line.po_number)}
              plain
              truncateDisplay={false}
              fitDisplayWidth
            />
          </div>
        );
      case 'date':
        return (
          <div data-col="date" className={dataCell(col, rule)}>
            <GridDateCellValue label={dateLabel} tooltip={line.pickup_date} className="text-role-caption" />
          </div>
        );
      case 'qty':
        return (
          <div data-col="qty" className={dataCell(col, rule)}>
            <span className="min-w-0 truncate tabular-nums text-role-caption text-text-muted">
              {line.quantity}
            </span>
          </div>
        );
      case 'condition':
        return (
          <div data-col="condition" className={dataCell(col, rule)}>
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
          <div data-col="price" className={dataCell(col, rule)}>
            <span className="tabular-nums text-role-caption font-semibold text-emerald-700">
              {pickupMoney(line.total_price)}
            </span>
          </div>
        );
      case 'status':
        return (
          <div data-col="status" className={dataCell(col, rule)}>
            <PickupStatusChip
              orderStatus={line.order_status}
              receivingId={line.receiving_id}
            />
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
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
        ledgerRowFillClass({
          selected: isSelected,
          capabilities: PICKUP_GRID_CAPABILITIES,
        }),
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
 * One LCPU order inside the pickup LedgerGrid.
 *
 * Always a flat list of leaf lines — no collapsible order summary (same Sheets
 * golden as Unbox History / Incoming). Grouping still drives upstream ordering;
 * each line is its own selectable record. Parent-style rollups belong only on a
 * drill parent map when that layout exists.
 */
export function PickupGridGroupRow({
  group,
  baseStripeIndex: _baseStripeIndex,
  selectedOrderId,
  onSelectOrder,
  columns = PICKUP_GRID_COLUMNS,
}: {
  group: RowGroup<PickupLine>;
  /** Kept for LedgerGrid `renderGroup` signature parity (unused — flat leaves). */
  baseStripeIndex: number;
  selectedOrderId: number | null;
  onSelectOrder: (orderId: number) => void;
  columns?: readonly PickupGridColumn[];
}) {
  const orderId = group.rows[0]?.order_id ?? null;
  const isOrderSelected = orderId != null && orderId === selectedOrderId;

  return (
    <>
      {group.rows.map((line) => (
        <PickupGridLeafRow
          key={line.id}
          line={line}
          isSelected={isOrderSelected}
          onSelectOrder={onSelectOrder}
          columns={columns}
        />
      ))}
    </>
  );
}
