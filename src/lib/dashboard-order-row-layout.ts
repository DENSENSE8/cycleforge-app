/** Dashboard / queue table row layout — the Orders desk's column SoT. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  omitShippedOnlyBindings,
  ORDERS_FIELD_CATALOG,
  ORDERS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/orders';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';

/** Stable key set for the orders-queue columns (scan order). */
export type OrdersQueueColumnKey =
  | 'select'
  /** Compound (two-row) presentation tracks — see {@link ORDERS_COMPOUND_COLUMNS}. */
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'state'
  | 'dates'
  /** Materialized SLOT tracks (`status:1…10`; sheet morph adds `subtitle:1…5`). */
  | `status:${number}`
  | `subtitle:${number}`
  | 'amount'
  | 'actions'
  // ── Station-bench flat legacy keys (STATION_HISTORY_COLUMNS only) ─────────
  | 'title'
  /** Derived days past ship-by (`0d` / `3d` / …). Replaced fused `sla` / `date`. */
  | 'age'
  | 'condition'
  | 'qty'
  | 'tester'
  | 'testedAt'
  | 'packer'
  | 'packedAt'
  | 'packStation'
  /** In-warehouse lifecycle stage (awaiting test / tested / packed / blocked). */
  | 'stage'
  /** Operator expedite toggle (`orders.is_urgent`). */
  | 'urgent'
  | 'order'
  | 'tracking'
  /** Trailing structural filler — absorbs leftover sheet width (`1fr`). */
  | '_fill';

/** One column of the orders-queue grid — the SoT that the grid template, the sticky header (label + type glyph + per-column menu), and the… */
export interface OrdersQueueColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: OrdersQueueColumnKey;
}

/** COMPOUND (two-row) Orders / To-Ship columns — MATERIALIZED from a {@link SlotLayout}, never hand-spliced. */
export function ordersCompoundColumnsFor(
  layout: SlotLayout,
  options?: { queueMode?: 'fulfillment' | 'labels' | 'staged' | 'shipped' },
): readonly OrdersQueueColumn[] {
  const resolved =
    options?.queueMode === 'shipped' ? layout : omitShippedOnlyBindings(layout);
  /* No `actions` track on Orders (operator ruling 2026-08-31 — "remove the three dots on the most right side"). */
  const base = compoundColumnsFor<OrdersQueueColumn>().filter((c) => c.key !== 'actions');
  return materializeTracks<OrdersQueueColumn>({
    layout: resolved,
    catalog: ORDERS_FIELD_CATALOG,
    base,
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts,
 * the canonical columns of the ONE Orders binding, and the SoT the To-ship
 * e2e specs derive their assertions from.
 */
export const ORDERS_COMPOUND_COLUMNS: readonly OrdersQueueColumn[] =
  ordersCompoundColumnsFor(ORDERS_PRODUCT_LAYOUT);

/** Legacy two-zone shell — Shipped / Receiving / walk-in. */
export function dashboardOrderRowShellClass(isMobile: boolean): string {
  return isMobile
    ? 'flex flex-col gap-1.5'
    : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2';
}

export function dashboardOrderRowChipsClass(isMobile: boolean): string {
  const base = 'flex shrink-0 flex-wrap items-center gap-0.5';
  return isMobile
    ? `${base} w-full justify-end`
    : `${base} justify-end pr-1`;
}
