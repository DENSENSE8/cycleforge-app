/**
 * SQL membership predicates for the outbound desk views (`pair=po`,
 * `queue=pick`) and the base queues they refine. One fragment per rule, read
 * by BOTH `GET /api/orders` and `GET /api/orders/desk-counts`, so a sidebar
 * badge and the list it opens cannot disagree. Parsing lives in
 * `@/lib/orders/desk-view-filters` (client-safe).
 */

import { sqlOrderHasPackScan, sqlOrderHasShipConfirm } from '@/lib/orders/order-grain-sql';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';

const SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

function alias(value: string): string {
  if (!SQL_ALIAS.test(value)) throw new Error(`invalid SQL alias: ${value}`);
  return value;
}

/**
 * `pair=po` membership: the order has an open shortage line earmarked onto a
 * PO line or a receiving line. Same live-link rule as `/api/orders`'
 * `shortage_link_status` column (shortage not cleared, link not released).
 */
export function sqlOrderHasPoPairedShortage(orderAlias = 'o'): string {
  const o = alias(orderAlias);
  return `EXISTS (
      SELECT 1
        FROM order_line_shortages ols
        JOIN shortage_inbound_links sil
          ON sil.shortage_id = ols.id
         AND sil.organization_id = ols.organization_id
       WHERE ols.order_id = ${o}.id
         AND ols.organization_id = ${o}.organization_id
         AND ols.status <> 'cleared'
         AND sil.link_status <> 'released'
         AND sil.source_kind IN ('po_line', 'receiving_line')
    )`;
}

/**
 * True when every live allocation on the order is picked — the complement of
 * the pick list's "picked < allocated, or nothing picked".
 *
 * Same unit grain as `/api/orders`' `allocation_facts` lateral (live =
 * not RELEASED/RETURNED; picked = PICKED/PACKED/SHIPPED; allocation joined to
 * its org-scoped serial unit). Picked is a subset of live, so "picked <
 * allocated OR picked = 0" is exactly "NOT (allocated > 0 AND nothing unpicked)".
 * `COUNT(*) > 0` is load-bearing: an aggregate over zero rows still yields
 * one row, and without it an order with NO allocations would read as picked.
 */
function sqlOrderFullyPicked(orderAlias: string): string {
  const o = alias(orderAlias);
  return `EXISTS (
      SELECT 1
        FROM order_unit_allocations pick_alloc_q
        JOIN serial_units pick_unit_q
          ON pick_unit_q.id = pick_alloc_q.serial_unit_id
         AND pick_unit_q.organization_id = pick_alloc_q.organization_id
       WHERE pick_alloc_q.order_id = ${o}.id
         AND pick_alloc_q.organization_id = ${o}.organization_id
         AND pick_alloc_q.state NOT IN ('RELEASED', 'RETURNED')
      HAVING COUNT(*) > 0
         AND COUNT(*) FILTER (
               WHERE pick_alloc_q.state NOT IN ('PICKED', 'PACKED', 'SHIPPED')
             ) = 0
    )`;
}

/**
 * `queue=pick` refinement ON TOP of the in-warehouse To-ship scope: no pack
 * scan on this order (order-grain) and not every allocated unit picked.
 */
export function sqlOrderAwaitingPick(orderAlias = 'o'): string {
  const o = alias(orderAlias);
  return `(NOT ${sqlOrderHasPackScan(o)} AND NOT ${sqlOrderFullyPicked(o)})`;
}

/**
 * In-warehouse To-ship membership — `/api/orders?inWarehouse=true` (the
 * To-ship desk's row feed) spelled as one predicate for the counts feed.
 * Expects `stn` = `shipping_tracking_numbers` joined on `o.shipment_id`
 * (the alias `SHIPPED_BY_CARRIER_SQL` is written against).
 */
export function sqlOrderInWarehouseToShip(orderAlias = 'o'): string {
  const o = alias(orderAlias);
  return `(
      NOT ${SHIPPED_BY_CARRIER_SQL}
      AND NOT ${sqlOrderHasShipConfirm(o)}
      AND COALESCE(${o}.fulfillment_channel, '') <> 'AFN'
      AND ${o}.shipment_id IS NOT NULL
      AND COALESCE(TRIM(stn.tracking_number_raw), '') <> ''
    )`;
}

/**
 * Shortage-desk (blocked) membership — `/api/orders?blockedOnly=true`: every
 * out-of-stock order not dock-confirmed and not Amazon-fulfilled, label or not.
 */
export function sqlOrderBlockedPending(orderAlias = 'o'): string {
  const o = alias(orderAlias);
  return `(
      ${o}.is_out_of_stock = true
      AND NOT ${sqlOrderHasShipConfirm(o)}
      AND COALESCE(${o}.fulfillment_channel, '') <> 'AFN'
    )`;
}
