/** Order-grain station membership SQL fragments (CF-03 / CF-04). */

import { PACK_ACTIVITY_TYPES, TECH_TEST_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';

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

/** ONE correlated `EXISTS` over `station_activity_logs` covering BOTH grains (order-grain metadata attribution + the sole-shipment legacy… */
function sqlOrderHasStationActivity(alias: string, activityTypes: readonly string[]): string {
  const a = alias;
  return `EXISTS (
      SELECT 1 FROM station_activity_logs sal
      WHERE sal.organization_id = ${a}.organization_id
        AND sal.activity_type IN (${sqlInList(activityTypes)})
        AND (
          (
            (sal.metadata->>'order_row_id') ~ '^[0-9]+$'
              AND (sal.metadata->>'order_row_id')::int = ${a}.id
            OR (
              sal.metadata->>'order_id' IS NOT NULL
              AND sal.metadata->>'order_id' = ${a}.order_id
            )
          )
          OR (
            sal.shipment_id IS NOT NULL
            AND sal.shipment_id = ${a}.shipment_id
            AND (sal.metadata->>'order_row_id') IS NULL
            AND ${SQL_SHIPMENT_IS_SOLE_ORDER.replace(/\bo\./g, `${a}.`)}
          )
        )
    )`;
}

/** Order has a Testing bench scan attributed to it (order-grain). */
export function sqlOrderHasTechScan(alias = 'o'): string {
  const a = alias;
  return `(
    EXISTS (
      SELECT 1 FROM tech_serial_numbers tsn
      WHERE tsn.order_id = ${a}.id
        AND tsn.organization_id = ${a}.organization_id
    )
    OR ${sqlOrderHasStationActivity(a, TECH_TEST_ACTIVITY_TYPES)}
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
