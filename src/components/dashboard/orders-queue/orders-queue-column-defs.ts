/**
 * TanStack `ColumnDef`s for the orders-queue spreadsheet (plan Phase A).
 *
 * Engine split (grid-surface-descriptor plan, hybrid B-): **TanStack owns the
 * column MODEL + sorting/visibility/order state; Kinetic Ledger owns markup.**
 * Each def carries the house `OrdersQueueColumn` geometry on `meta.queueColumn`
 * — `ordersQueueGridTemplateFor` / frozen offsets / force-hide keep reading the
 * house model, so TanStack never grows a second width system (plan risk #1).
 * Cell markup stays in the house per-column registries
 * (`OrdersQueueTableRow.renderDesktopCell`, `OrderGroupSummary`); accessors
 * here exist for state math (and future TanStack-sorted surfaces), not JSX.
 *
 * Mode → column set:
 *   `fulfillment.default` — select · title · date · age · qty · cond ·
 *     order · tracking (the canonical `ORDERS_QUEUE_COLUMNS`).
 *   `fulfillment.tested` (`?tested`) — **tester** + **testedAt** surface per
 *     plan §9 (`ORDERS_QUEUE_TESTED_COLUMNS`).
 */

import type { ColumnDef } from '@tanstack/react-table';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { buildLedgerColumnDefs } from '@/design-system/components/grid';
import {
  isOrdersQueueFrozen,
  ordersQueueColumnsFor,
  type OrdersQueueColumn,
  type OrdersQueueColumnMode,
} from '@/lib/dashboard-order-row-layout';
import { isQueueColumnSort } from '@/utils/queue-display-sort';
import {
  queueRowShipBySource,
  queueRowTestedAtRaw,
  queueRowTesterNameRaw,
  type QueueRowRecord,
} from './helpers';

/** State-math accessor per column key (sort/group value — NOT display markup). */
function accessorFor(key: OrdersQueueColumn['key']): (row: ShippedOrder) => unknown {
  switch (key) {
    case 'title':
      return (row) => String(row.product_title ?? '');
    case 'date':
      return (row) => queueRowShipBySource(row);
    case 'age':
      return (row) => row.deadline_at ?? null;
    case 'status':
      return (row) => {
        const r = row as QueueRowRecord;
        return {
          hasTechScan: Boolean(r.has_tech_scan),
          isOutOfStock: Boolean(r.is_out_of_stock ?? r.isOutOfStock),
        };
      };
    case 'qty':
      return (row) => Number(row.quantity) || 0;
    case 'condition':
      return (row) => String(row.condition ?? '');
    case 'tester':
      return (row) => queueRowTesterNameRaw(row as QueueRowRecord);
    case 'testedAt':
      return (row) => queueRowTestedAtRaw(row as QueueRowRecord);
    case 'platform':
      return (row) => String(row.account_source ?? '');
    case 'order':
      return (row) => String(row.order_id ?? '');
    case 'tracking':
      return (row) => {
        const r = row as QueueRowRecord;
        return String((r.tracking_number as string | undefined) || row.shipping_tracking_number || '').trim();
      };
    default:
      return () => null;
  }
}

/** House column models → TanStack defs via the DS descriptor factory. */
function defsFor(mode: OrdersQueueColumnMode): ColumnDef<ShippedOrder, unknown>[] {
  return buildLedgerColumnDefs<ShippedOrder, OrdersQueueColumn>(ordersQueueColumnsFor(mode), {
    // URL `?sort=` stays the durable sort vocabulary — only its columns sort.
    isSortable: isQueueColumnSort,
    // Age activates most-late-first (matches `defaultDirForQueueSort`).
    sortDescFirst: (key) => key === 'age',
    isLocked: isOrdersQueueFrozen,
    accessorFor,
  });
}

const DEFS_BY_MODE: Record<OrdersQueueColumnMode, readonly ColumnDef<ShippedOrder, unknown>[]> = {
  'fulfillment.default': defsFor('fulfillment.default'),
  'fulfillment.tested': defsFor('fulfillment.tested'),
};

/** The TanStack column defs for a queue mode (stable references — safe deps). */
export function ordersQueueColumnDefsFor(
  mode: OrdersQueueColumnMode,
): readonly ColumnDef<ShippedOrder, unknown>[] {
  return DEFS_BY_MODE[mode];
}

/** House geometry model off a TanStack column def (meta round-trip). */
export function queueColumnOf(def: ColumnDef<ShippedOrder, unknown>): OrdersQueueColumn {
  const meta = def.meta?.gridColumn;
  if (!meta) throw new Error(`orders-queue column def "${def.id}" is missing meta.gridColumn`);
  return meta as OrdersQueueColumn;
}
