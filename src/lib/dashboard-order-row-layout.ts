/** Dashboard / queue table row layout — the Orders desk's column SoT. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  omitShippedOnlyBindings,
  ORDERS_FIELD_CATALOG,
  ORDERS_INDEX_FIELD_CATALOG,
  ORDERS_INDEX_LAYOUT,
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

/** The INDEX row box in px — one line per order (Polaris rows sit at ~40–48). */
export const ORDERS_INDEX_ROW_PX = 44;

/**
 * The INDEX face's structural skeleton — what it paints with zero bindings:
 * the select gutter, then ORDER, frozen, always first (Shopify's rule), then
 * the filler. Every other column is a slot binding.
 */
const ORDERS_INDEX_BASE: readonly OrdersQueueColumn[] = (() => {
  const compound = compoundColumnsFor<OrdersQueueColumn>();
  const select = compound.find((c) => c.key === 'select')!;
  const identity = compound.find((c) => c.key === 'fulfillment')!;
  const fill = compound.find((c) => c.key === '_fill')!;
  return [
    // Wide enough for the always-on checkbox, not the compound hover gutter.
    { ...select, width: 'minmax(2.25rem, 2.25rem)' },
    // Full order ids are never truncated — Amazon's run 19 characters, plus
    // the platform dot, the group disclosure and the note mark.
    { ...identity, label: 'Order', gridLabel: 'Order', width: 'minmax(11.5rem, 11.5rem)' },
    fill,
  ];
})();

/**
 * Per-FIELD geometry on the index — the display-type defaults are sized for a
 * two-line compound cell; one-line order facts want their own measure.
 */
const ORDERS_INDEX_TRACK_GEOMETRY: Readonly<
  Record<string, Pick<OrdersQueueColumn, 'width' | 'align'>>
> = {
  'orders.order_date': { width: 'minmax(4.75rem, 4.75rem)', align: 'start' },
  'orders.customer': { width: 'minmax(8rem, 10rem)' },
  'orders.channel': { width: 'minmax(5.5rem, 5.5rem)' },
  'orders.total': { width: 'minmax(5.5rem, 5.5rem)', align: 'end' },
  'orders.fulfillment': { width: 'minmax(11rem, 11rem)' },
  'orders.fulfill_by': { width: 'minmax(9rem, 9rem)', align: 'start' },
  'orders.items': { width: 'minmax(4.5rem, 4.5rem)', align: 'end' },
  'orders.delivery': { width: 'minmax(5rem, 6rem)' },
  'orders.tags': { width: 'minmax(8rem, 11rem)' },
  'orders.bin': { width: 'minmax(6rem, 8rem)' },
};

/** INDEX (one line per order) To-ship columns — MATERIALIZED from a sheet {@link SlotLayout}. */
export function ordersIndexColumnsFor(layout: SlotLayout): readonly OrdersQueueColumn[] {
  return materializeTracks<OrdersQueueColumn>({
    layout,
    catalog: ORDERS_INDEX_FIELD_CATALOG,
    base: ORDERS_INDEX_BASE,
    statusAnchorKey: 'fulfillment',
    subtitleAnchorKey: 'fulfillment',
  }).map((col) => {
    const geometry = col.fieldId ? ORDERS_INDEX_TRACK_GEOMETRY[col.fieldId] : undefined;
    return geometry ? { ...col, ...geometry } : col;
  });
}

/** The index face's product-default columns — the SoT specs and guards read. */
export const ORDERS_INDEX_COLUMNS: readonly OrdersQueueColumn[] =
  ordersIndexColumnsFor(ORDERS_INDEX_LAYOUT);

/**
 * Is this mounted model the INDEX face? The skeleton is the discriminant: the
 * compound model carries the photo and item tracks, the index never does.
 */
export function isOrdersIndexColumnModel(columns: readonly { key: string }[]): boolean {
  return (
    columns.some((c) => c.key === 'fulfillment') &&
    !columns.some((c) => c.key === 'thumb' || c.key === 'item')
  );
}

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
