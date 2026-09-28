/** Order-grain station membership SQL fragments (CF-03 / CF-04). */

import { ORDER_PICK_SCAN_ACTIVITY_TYPES, PACK_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';

/** True when this shipment has no sibling orders (safe for legacy fallback). */
const SQL_SHIPMENT_IS_SOLE_ORDER = `(
  o.shipment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM orders o2
    WHERE o2.shipment_id = o.shipment_id
      AND o2.organization_id = o.organization_id
      AND o2.id <> o.id
  )
)`;

/**
 * ONE correlated `EXISTS` over `station_activity_logs` covering BOTH grains:
 * order-grain attribution (`order_row_id` / `ext_order_id`, the STORED
 * generated columns over `metadata` from migration 2026-09-26_perf_01) and
 * the sole-shipment legacy fallback.
 *
 * Every arm compares plain int/text columns because under forced RLS
 * (`app_tenant`) only leakproof operators can be index conditions: the
 * jsonb `->>` / `~` / `::int` spelling this replaced planned as a scan of the
 * org's whole SAL table per order (queue-counts 11 s; phase0-findings §2.1).
 * With int/text equality each arm is an index probe and the three arms
 * combine as a BitmapOr. The legacy arm's `metadata->>'order_row_id' IS NULL`
 * stays jsonb on purpose (exact legacy semantics) — it only filters the few
 * rows the shipment_id probe returns.
 */
function sqlOrderHasStationActivity(alias: string, activityTypes: readonly string[]): string {
  return `EXISTS (
      SELECT 1 FROM station_activity_logs sal
      WHERE sal.activity_type IN (${sqlInList(activityTypes)})
        AND ${sqlStationActivityMatchesOrder('sal', alias)}
    )`;
}

/**
 * `station_activity_logs` row (`salAlias`) is attributed to order
 * (`orderAlias`): the predicate behind every order-grain station fact, so a
 * writer reversing those facts (un-pick) removes exactly the rows they read.
 */
export function sqlStationActivityMatchesOrder(salAlias: string, orderAlias = 'o'): string {
  const s = salAlias;
  const a = orderAlias;
  return `${s}.organization_id = ${a}.organization_id
        AND (
          ${s}.order_row_id = ${a}.id
          OR ${s}.ext_order_id = ${a}.order_id
          OR (
            ${s}.shipment_id IS NOT NULL
            AND ${s}.shipment_id = ${a}.shipment_id
            AND (${s}.metadata->>'order_row_id') IS NULL
            AND ${SQL_SHIPMENT_IS_SOLE_ORDER.replace(/\bo\./g, `${a}.`)}
          )
        )`;
}

/**
 * Order has been picked (order-grain): a serial was taken for it, or the
 * picker desk / FBA scanned it (ORDER_PICK_SCAN_ACTIVITY_TYPES). A pick, not
 * QC — unit QC lives on testing_results.
 */
export function sqlOrderHasPickScan(alias = 'o'): string {
  const a = alias;
  return `(
    EXISTS (
      SELECT 1 FROM tech_serial_numbers tsn
      WHERE tsn.order_id = ${a}.id
        AND tsn.organization_id = ${a}.organization_id
    )
    OR ${sqlOrderHasStationActivity(a, ORDER_PICK_SCAN_ACTIVITY_TYPES)}
  )`;
}

/** Order has been packed (order-grain). */
export function sqlOrderHasPackScan(alias = 'o'): string {
  const a = alias;
  return `(
    ${sqlOrderHasStationActivity(a, PACK_ACTIVITY_TYPES)}
  )`;
}

/** Dock scan-out (SHIP_CONFIRM) on this order's shipment. */
export function sqlOrderHasShipConfirm(alias = 'o'): string {
  const a = alias;
  return `EXISTS (
      SELECT 1 FROM station_activity_logs sal_out
      WHERE sal_out.shipment_id IS NOT NULL
        AND sal_out.shipment_id = ${a}.shipment_id
        AND sal_out.organization_id = ${a}.organization_id
        AND sal_out.activity_type = 'SHIP_CONFIRM'
    )`;
}

/**
 * JOIN ON predicate: tech_serial_numbers (`tsn`) matches order (`o`).
 * Prefer order_id; dual-read sole-shipment when order_id is null (sunset).
 */
export function sqlTsnMatchesOrder(orderAlias = 'o', tsnAlias = 'tsn'): string {
  const o = orderAlias;
  const t = tsnAlias;
  return `(
    ${t}.organization_id = ${o}.organization_id
    AND (
      ${t}.order_id = ${o}.id
      OR (
        ${t}.order_id IS NULL
        AND ${t}.shipment_id IS NOT NULL
        AND ${t}.shipment_id = ${o}.shipment_id
        AND NOT EXISTS (
          SELECT 1 FROM orders o2
          WHERE o2.shipment_id = ${o}.shipment_id
            AND o2.organization_id = ${o}.organization_id
            AND o2.id <> ${o}.id
        )
      )
    )
  )`;
}

/**
 * Serial aggregation for an order — prefer order_id; dual-read sole-shipment
 * legacy when order_id is null (sunset comment in call sites).
 */
export function sqlOrderSerialsAgg(alias = 'o'): string {
  const a = alias;
  return `COALESCE(
    (
      SELECT array_agg(DISTINCT tsn.serial_number ORDER BY tsn.serial_number)
      FROM tech_serial_numbers tsn
      WHERE tsn.serial_number IS NOT NULL
        AND ${sqlTsnMatchesOrder(a, 'tsn')}
    ),
    ARRAY[]::text[]
  )`;
}
