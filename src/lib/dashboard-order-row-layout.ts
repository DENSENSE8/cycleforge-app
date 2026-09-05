/**
 * Dashboard / queue table row layout — the Orders desk's column SoT.
 *
 * Since the Wave-1 hand-model kill
 * (`docs/kill-list/07-slot-table-hand-models.md`) the Orders desk owns NO hand
 * column array: every outbound lane (Pending · Tested-filter · Packed · Labels
 * · Staged · Review · Shipped) mounts the COMPOUND two-row model materialized
 * from the effective `SlotLayout` by {@link ordersCompoundColumnsFor} — track
 * keys are slot indices (`status:1…N`), never field ids, and what shows is an
 * org/staff/product layout document, not a deploy.
 *
 * Do not re-add a hand fact-track array here; bind a catalog field instead.
 *
 * The legacy two-zone shell helpers at the bottom serve the board / walk-in
 * rows that never joined the grid.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  omitShippedOnlyBindings,
  omitShortageCoverageBindings,
  ensureShortageCoverageBinding,
  ORDERS_FIELD_CATALOG,
  ORDERS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/orders';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';

/**
 * Stable key set for the orders-queue columns (scan order).
 *
 * The compound + slot keys are the Orders desk's whole vocabulary. Legacy
 * fact keys after them remain on the type for URL/sort compatibility.
 */
export type OrdersQueueColumnKey =
  | 'select'
  /** Compound (two-row) presentation tracks — see {@link ORDERS_COMPOUND_COLUMNS}. */
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'dates'
  | 'state'
  /**
   * Materialized SLOT tracks (`status:1…10`; sheet morph adds `subtitle:1…5`).
   * Keys are slot indices, never field ids — rebinding a slot keeps every
   * width/pref keyed by it. Built by `materializeTracks`, absorbing the old
   * hand-spliced `tested` step.
   */
  | `status:${number}`
  | `subtitle:${number}`
  | 'actions'
  // ── Legacy fact keys (URL/sort compatibility only) ─────────
  | 'title'
  /** Derived days past ship-by (`0d` / `3d` / …). Replaced fused `sla` / `date`. */
  | 'age'
  | 'condition'
  | 'qty'
  | 'amount'
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

/**
 * One column of the orders-queue grid — the SoT that the grid template, the
 * sticky header (label + type glyph + per-column menu), and the body/group
 * cells all read, so a column's width, label, type, and hide-key live in ONE
 * place and can never drift apart.
 *
 * EXTENDS the house model rather than re-declaring it. `width` / `label` /
 * `gridLabel` / `labelFitRem` / `type` / `hideKey` were all copied out with
 * their own JSDoc here, which is how a Pending-only field could drift from the
 * same field on every other surface — and why `align` and `omitCellIcon` had to
 * be added in five places before this. Every shared field is inherited; only
 * `key` narrows. `SlotTrackFields` carries the materialized slot metadata.
 */
export interface OrdersQueueColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: OrdersQueueColumnKey;
}

/**
 * COMPOUND (two-row) Orders / To-Ship columns — MATERIALIZED from a
 * {@link SlotLayout}, never hand-spliced.
 *
 * Shared chrome prefix is {@link compoundColumnsFor} / `COMPOUND_TRACKS` —
 * Receiving and Tasks keep that object identity. Orders inserts its STATUS
 * band (`status:1…N`, one track per bound catalog field) after `state` via
 * `materializeTracks`. The old `ORDERS_TESTED_TRACK` hand splice is absorbed:
 * the product default binds `orders.picked` into `status:1`, and an org that
 * binds Packed / Scanned out gets `status:2…` from the same materializer.
 */
export function ordersCompoundColumnsFor(
  layout: SlotLayout,
  options?: {
    queueMode?: 'fulfillment' | 'labels' | 'staged' | 'shipped';
    shortageDesk?: boolean;
  },
): readonly OrdersQueueColumn[] {
  let resolved =
    options?.queueMode === 'shipped' ? layout : omitShippedOnlyBindings(layout);
  resolved = options?.shortageDesk
    ? ensureShortageCoverageBinding(resolved)
    : omitShortageCoverageBindings(resolved);
  const base = compoundColumnsFor<OrdersQueueColumn>();
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
