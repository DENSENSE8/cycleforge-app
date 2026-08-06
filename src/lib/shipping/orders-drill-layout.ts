/**
 * To-ship Orders drill URL contract — thin domain binding over the WMS-wide
 * LedgerGrid drill SoT (`ledger-drill-layout`).
 *
 * - `olayout=list` (default when omitted) — flat leaf OrdersGrid (no in-grid fold)
 * - `olayout=drill` — linked dual panes (parent map · order lines); parent
 *   rollups live only here
 * - `drillOrder` — durable selected order-group key
 *
 * Orthogonal to compare (`clayout` / `c0`…`c3`) and inspector (`openOrderId`).
 */

import {
  parseLedgerDrillLayout,
  parseLedgerDrillParentKey,
  writeLedgerDrillParams,
  type LedgerDrillLayout,
  type LedgerDrillUrlContract,
} from '@/design-system/components/grid';

export const ORDERS_DRILL_LAYOUT_PARAM = 'olayout';
export const ORDERS_DRILL_ORDER_PARAM = 'drillOrder';

export type OrdersDrillLayout = LedgerDrillLayout;

const ORDERS_DRILL_URL: LedgerDrillUrlContract = {
  layoutParam: ORDERS_DRILL_LAYOUT_PARAM,
  parentParam: ORDERS_DRILL_ORDER_PARAM,
  defaultLayout: 'list',
};

export function parseOrdersDrillLayout(
  raw: string | null | undefined,
): OrdersDrillLayout {
  return parseLedgerDrillLayout(raw, ORDERS_DRILL_URL);
}

export function parseOrdersDrillOrder(
  raw: string | null | undefined,
): string | null {
  return parseLedgerDrillParentKey(raw);
}

/** Mutate URLSearchParams for Orders drill chrome. */
export function writeOrdersDrillParams(
  params: URLSearchParams,
  layout: OrdersDrillLayout,
  drillOrder: string | null,
): void {
  writeLedgerDrillParams(params, ORDERS_DRILL_URL, layout, drillOrder);
}
