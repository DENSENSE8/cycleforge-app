/**
 * TanStack `ColumnDef`s for the orders-queue spreadsheet (plan Phase A).
 *
 * Engine split (grid-surface-descriptor plan, hybrid B-): **TanStack owns the
 * column MODEL + sorting/visibility/order state; Kinetic Ledger owns markup.**
 * Each def carries the house `OrdersQueueColumn` geometry on `meta.gridColumn`
 * — `ordersQueueGridTemplateFor` / frozen offsets / force-hide keep reading the
 * house model, so TanStack never grows a second width system (plan risk #1).
 * Cell markup stays in the house per-column registries
 * (`OrdersQueueTableRow.renderDesktopCell`); accessors
 * here exist for state math (and future TanStack-sorted surfaces), not JSX.
 *
 * Mode → column set:
 *   `fulfillment.default` — select · order · age · title · condition · qty · tracking · _fill
 *     (the canonical `ORDERS_QUEUE_COLUMNS`; Product-only resize; `_fill` slack).
 *   `fulfillment.tested` (`?tested`) — **tester** + **testedAt** after Product,
 *     then Cond, per plan §9 (`ORDERS_QUEUE_TESTED_COLUMNS`).
 *
 * Capabilities live on {@link makeOrdersGridDescriptor} /
 * {@link ORDERS_GRID_CAPABILITIES} — this module re-exports stable TanStack
 * defs for the two modes.
 */

import type { ColumnDef } from '@tanstack/react-table';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  type OrdersQueueColumn,
  type OrdersQueueColumnMode,
} from '@/lib/dashboard-order-row-layout';
import { makeOrdersGridDescriptor } from './orders-queue-descriptor';

const DESCRIPTOR_BY_MODE: Record<
  OrdersQueueColumnMode,
  ReturnType<typeof makeOrdersGridDescriptor>
> = {
  'fulfillment.default': makeOrdersGridDescriptor('fulfillment.default'),
  'fulfillment.tested': makeOrdersGridDescriptor('fulfillment.tested'),
};

/** The TanStack column defs for a queue mode (stable references — safe deps). */
export function ordersQueueColumnDefsFor(
  mode: OrdersQueueColumnMode,
): readonly ColumnDef<ShippedOrder, unknown>[] {
  return DESCRIPTOR_BY_MODE[mode].columnDefs;
}

/** House geometry model off a TanStack column def (meta round-trip). */
export function queueColumnOf(def: ColumnDef<ShippedOrder, unknown>): OrdersQueueColumn {
  const meta = def.meta?.gridColumn;
  if (!meta) throw new Error(`orders-queue column def "${def.id}" is missing meta.gridColumn`);
  return meta as OrdersQueueColumn;
}
