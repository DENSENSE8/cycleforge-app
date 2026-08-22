/**
 * Order-grain station membership SQL fragments (CF-03 / CF-04).
 *
 * Serial↔order and pack-queue membership must not be inferred solely from
 * `shipment_id` — sibling orders that share a carton would smear / vanish.
 *
 * These fragments expect the outer query alias `o` = `orders`.
 * Prefer `tech_serial_numbers.order_id` and SAL `metadata.order_row_id`;
 * fall back to shipment-grain ONLY when the shipment has a single order
 * (legacy dual-read — sunset once TSN.order_id is backfilled).
 */

import { PACK_ACTIVITY_TYPES, TECH_TEST_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';

/** True when this shipment has no sibling orders (safe for legacy fallback). */
export const SQL_SHIPMENT_IS_SOLE_ORDER = `(
  o.shipment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM orders o2
    WHERE o2.shipment_id = o.shipment_id
      AND o2.organization_id = o.organization_id
      AND o2.id <> o.id
  )
)`;

/**
 * ONE correlated `EXISTS` over `station_activity_logs` covering BOTH grains
 * (order-grain metadata attribution + the sole-shipment legacy fallback).
 *
 * **Why one EXISTS and not two under `OR`.** Postgres only pulls an EXISTS
 * sublink up into a semi/anti-join when it is a top-level `AND` conjunct
 * (`pull_up_sublinks`, which runs *before* `eval_const_expressions` — so
 * De Morgan on `NOT (EXISTS … OR EXISTS …)` comes too late to help). Under an
 * `OR` both branches stay correlated SubPlans re-executed per outer row, which
 * is what made `AND NOT sqlOrderHasPackScan('o')` scan SAL twice for every
 * order on the to-ship list. Pushing the disjunction *inside* one subquery
 * keeps the truth value identical and leaves a single sublink the planner can
 * pull up (semi-join positive / anti-join negated), with the inner `OR` free to
 * become a BitmapOr over the per-branch indexes.
 *
 * **Why it is exact.** Both branches select from the same relation under the
 * same `organization_id` + `activity_type` prefix, so
 * `EXISTS(σ_A) ∨ EXISTS(σ_B) ≡ EXISTS(σ_{A∨B})`. The sole-order guard does not
 * reference `sal` and is strictly two-valued (`IS NOT NULL` / `NOT EXISTS`
 * never yield NULL), so hoisting it into the second arm is a no-op:
 * `S ∧ EXISTS(σ_B) ≡ EXISTS(σ_{B ∧ S})`.
 *
 * Arm order is load-bearing for cost, not for truth: the cheap column
 * comparisons are evaluated before the correlated sibling-exclusion sublink, and
 * the `~ '^[0-9]+$'` guard stays immediately left of its `::int` cast inside the
 * same nested `AND` (nested BoolExpr args short-circuit left-to-right, unlike a
 * top-level qual list the planner may reorder).
 */
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

/**
 * Order has a Testing bench scan attributed to it (order-grain).
 * Used by Up Next / has_tech_scan projections.
 *
 * Stays a two-branch `OR` because the first branch reads a different relation
 * (`tech_serial_numbers`); folding it in with `UNION ALL` would only *lose* the
 * pullup (`simplify_EXISTS_query` rejects set operations) without saving a scan.
 */
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

/**
 * Order has been packed (order-grain). Used by excludePacked / fulfillmentScope.
 *
 * ONE sublink, so `AND sqlOrderHasPackScan('o')` plans as a semi-join and
 * `AND NOT sqlOrderHasPackScan('o')` as an anti-join instead of a per-row
 * SubPlan pair.
 */
export function sqlOrderHasPackScan(alias = 'o'): string {
  const a = alias;
  return `(
    ${sqlOrderHasStationActivity(a, PACK_ACTIVITY_TYPES)}
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
