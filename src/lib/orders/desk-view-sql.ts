/** SQL membership predicates for the outbound desk views (`pair=po`, `queue=pick`) and the base queues they refine. */

import type { DeskRefinements } from '@/lib/orders/desk-view-filters';
import { sqlOrderHasPackScan, sqlOrderHasShipConfirm, sqlOrderHasPickScan, sqlStationActivityMatchesOrder } from '@/lib/orders/order-grain-sql';
import { ORDER_PICK_SCAN_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { PICKUP_FULFILLMENT_CHANNEL } from '@/lib/orders/release-gates';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';

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

/** True when every live allocation on the order is picked — the complement of the pick list's "picked < allocated, or nothing picked". */
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
 * Where an order's stage signals are read from, as SQL expressions over the
 * order alias. Omitted: the live source probes (`sqlOrderHasPickScan`,
 * `sqlOrderPickedByStaffId`, …). `/api/orders` passes the
 * `order_stage_facts` columns it has joined.
 */
export interface OrderStageSignals {
  hasPickScan: string;
  hasPackScan: string;
  /** Who actually picked (`?pickedBy=`). */
  pickedBy: string;
  /** Live ORDER/PICK assignee (`?pickerId=`). */
  pickerId: string;
  /** Live ORDER/PACK assignee (`?packedBy=`). */
  packerId: string;
}

/**
 * `queue=pick` refinement ON TOP of the in-warehouse To-ship scope: no pack
 * scan on this order (order-grain) and not every allocated unit picked.
 */
export function sqlOrderAwaitingPick(orderAlias = 'o', signals?: Pick<OrderStageSignals, 'hasPackScan'>): string {
  const o = alias(orderAlias);
  return `(NOT ${signals?.hasPackScan ?? sqlOrderHasPackScan(o)} AND NOT ${sqlOrderFullyPicked(o)})`;
}

/**
 * In-warehouse To-ship membership — `/api/orders?inWarehouse=true` (the To-ship desk's row feed) spelled as one predicate for the counts feed.
 * A counter pickup (`fulfillment_channel = 'PICKUP'`) never gets a label or tracking, so it belongs without them.
 */
export function sqlOrderInWarehouseToShip(orderAlias = 'o'): string {
  const o = alias(orderAlias);
  return `(
      NOT ${SHIPPED_BY_CARRIER_SQL}
      AND NOT ${sqlOrderHasShipConfirm(o)}
      AND COALESCE(${o}.fulfillment_channel, '') <> 'AFN'
      AND (
        ${o}.fulfillment_channel = '${PICKUP_FULFILLMENT_CHANNEL}'
        OR (${o}.shipment_id IS NOT NULL AND COALESCE(TRIM(stn.tracking_number_raw), '') <> '')
      )
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

/** Queue views whose rows are `orders` (`/api/orders` feeds them; desk-counts and nav facets count them). */
export type DeskQueueView = 'triage' | 'pick' | 'po';

/**
 * Membership of one queue view — the ONE predicate desk-counts and the nav
 * facets share, equal to what `/api/orders` assembles from the flags each desk
 * sends (`inWarehouse=true` [+ `queue=pick`], or `blockedOnly=true&pair=po`).
 * Expects `o` = orders and, for triage/pick, `stn` = its shipping_tracking_numbers join.
 */
export function sqlDeskQueueScope(view: DeskQueueView, orderAlias = 'o'): string {
  const o = alias(orderAlias);
  if (view === 'po') return `(${sqlOrderBlockedPending(o)} AND ${sqlOrderHasPoPairedShortage(o)})`;
  if (view === 'pick') return `(${sqlOrderInWarehouseToShip(o)} AND ${sqlOrderAwaitingPick(o)})`;
  return sqlOrderInWarehouseToShip(o);
}

export const DESK_STAGES = ['pending', 'picked', 'packed'] as const;
export type DeskStage = (typeof DESK_STAGES)[number];

/**
 * `?stage=` on the To-ship desk, order-grain (CF-03 / CF-04): picked = pick
 * scan and no pack; pending = neither; packed = pack scan (only meaningful
 * under inWarehouse, where packed-staged rows still sit). The three are a
 * partition of any row set.
 */
export function sqlOrderDeskStage(
  stage: DeskStage,
  orderAlias = 'o',
  signals?: Pick<OrderStageSignals, 'hasPickScan' | 'hasPackScan'>,
): string {
  const o = alias(orderAlias);
  const pick = signals?.hasPickScan ?? sqlOrderHasPickScan(o);
  const pack = signals?.hasPackScan ?? sqlOrderHasPackScan(o);
  if (stage === 'packed') return pack;
  if (stage === 'picked') return `(${pick} AND NOT ${pack})`;
  return `(NOT ${pick} AND NOT ${pack})`;
}

const SQL_PARAM_REF = /^\$[1-9][0-9]*$/;

/**
 * `?staff=` — ANY non-canceled pack or pick assignment to the staffer, not
 * just the latest ranked one (a reassignment must not hide work).
 * `staffParam` is the bind placeholder, e.g. `$4`.
 */
export function sqlOrderAssignedToStaff(staffParam: string, orderAlias = 'o'): string {
  const o = alias(orderAlias);
  if (!SQL_PARAM_REF.test(staffParam)) throw new Error(`invalid SQL param ref: ${staffParam}`);
  return `EXISTS (
      SELECT 1 FROM work_assignments wa
      WHERE wa.organization_id = ${o}.organization_id
        AND wa.entity_type = 'ORDER' AND wa.entity_id = ${o}.id
        AND wa.status <> 'CANCELED'
        AND (wa.assigned_packer_id = ${staffParam} OR wa.assigned_tech_id = ${staffParam})
    )`;
}

function paramRef(value: string): string {
  if (!SQL_PARAM_REF.test(value)) throw new Error(`invalid SQL param ref: ${value}`);
  return value;
}

/** `?packedBy=` subject: the latest live PACK assignee (the list's `wa_p` lateral), as a scalar subquery. */
export function sqlOrderPackAssigneeId(orderAlias = 'o'): string {
  const o = alias(orderAlias);
  return `(
      SELECT wa_pk.assigned_packer_id
        FROM work_assignments wa_pk
       WHERE wa_pk.organization_id = ${o}.organization_id
         AND wa_pk.entity_type = 'ORDER'
         AND wa_pk.entity_id = ${o}.id
         AND wa_pk.work_type = 'PACK'
         AND wa_pk.assigned_packer_id IS NOT NULL
         AND wa_pk.status <> 'CANCELED'
       ORDER BY wa_pk.updated_at DESC, wa_pk.id DESC
       LIMIT 1
    )`;
}

/** `?pickerId=` subject: the latest live ORDER/PICK assignee (the list's `picker_id`), as a scalar subquery. */
export function sqlOrderPickAssigneeId(orderAlias = 'o'): string {
  const o = alias(orderAlias);
  return `(
      SELECT wa_pk_asg.assigned_tech_id
        FROM work_assignments wa_pk_asg
       WHERE wa_pk_asg.organization_id = ${o}.organization_id
         AND wa_pk_asg.entity_type = 'ORDER'
         AND wa_pk_asg.entity_id = ${o}.id
         AND wa_pk_asg.work_type = 'PICK'
         AND wa_pk_asg.assigned_tech_id IS NOT NULL
         AND wa_pk_asg.status <> 'CANCELED'
       ORDER BY wa_pk_asg.updated_at DESC, wa_pk_asg.id DESC
       LIMIT 1
    )`;
}

/**
 * Who actually picked the order, as a scalar: the same four sources, in the
 * same priority, as `PICK_FACTS_LATERALS` (`picked_by` on the list rows) —
 * allocation pick event › picking session › pick scan (matched exactly as
 * `sqlOrderHasPickScan` matches it) › serial taken. Keep the two in step.
 */
export function sqlOrderPickedByStaffId(orderAlias = 'o'): string {
  const o = alias(orderAlias);
  return `COALESCE(
      (
        SELECT pk_ie.actor_staff_id
          FROM order_unit_allocations pk_oua
          JOIN inventory_events pk_ie
            ON pk_ie.serial_unit_id = pk_oua.serial_unit_id
           AND pk_ie.organization_id = pk_oua.organization_id
           AND pk_ie.event_type IN ('PICKED', 'FORCE_PICK')
           AND pk_ie.occurred_at >= pk_oua.allocated_at
         WHERE pk_oua.order_id = ${o}.id
           AND pk_oua.organization_id = ${o}.organization_id
           AND pk_oua.state IN ('PICKED', 'PACKED', 'SHIPPED', 'RETURNED')
         ORDER BY pk_ie.occurred_at DESC NULLS LAST, pk_ie.id DESC
         LIMIT 1
      ),
      (
        SELECT pk_ps.picker_staff_id
          FROM picking_sessions pk_ps
         WHERE pk_ps.order_id = ${o}.id
           AND pk_ps.organization_id = ${o}.organization_id
           AND NOT pk_ps.abandoned
         ORDER BY COALESCE(pk_ps.ended_at, pk_ps.started_at) DESC, pk_ps.id DESC
         LIMIT 1
      ),
      (
        SELECT pk_sal.staff_id
          FROM station_activity_logs pk_sal
         WHERE pk_sal.activity_type IN (${sqlInList(ORDER_PICK_SCAN_ACTIVITY_TYPES)})
           AND ${sqlStationActivityMatchesOrder('pk_sal', o)}
         ORDER BY pk_sal.created_at DESC, pk_sal.id DESC
         LIMIT 1
      ),
      (
        SELECT pk_tsn.tested_by
          FROM tech_serial_numbers pk_tsn
         WHERE pk_tsn.order_id = ${o}.id
           AND pk_tsn.organization_id = ${o}.organization_id
         ORDER BY pk_tsn.created_at DESC, pk_tsn.id DESC
         LIMIT 1
      )
    )`;
}

/** `?pickedBy=` — the order was picked by the staffer bound at `staffParam` (e.g. `$4`). */
export function sqlOrderPickedByStaff(orderAlias: string, staffParam: string): string {
  return `${sqlOrderPickedByStaffId(orderAlias)} = ${paramRef(staffParam)}`;
}

/** A timestamptz expression's warehouse civil day. */
export function sqlWarehouseDay(timestampSql: string): string {
  return `timezone('${WAREHOUSE_TIME_ZONE}', ${timestampSql})::date`;
}

/** `day(ts) >= $n` — inclusive lower civil-day bound. */
export function sqlWarehouseDayOnOrAfter(timestampSql: string, dayParam: string): string {
  return `${sqlWarehouseDay(timestampSql)} >= ${paramRef(dayParam)}::date`;
}

/** `day(ts) <= $n` — inclusive upper civil-day bound. */
export function sqlWarehouseDayOnOrBefore(timestampSql: string, dayParam: string): string {
  return `${sqlWarehouseDay(timestampSql)} <= ${paramRef(dayParam)}::date`;
}

/**
 * The unshipped desk's refinements as `AND`-able predicates — the ONE
 * spelling `/api/orders` and the outbound nav facets both bind, so a facet
 * total equals the list total. `bind` pushes a value and returns its
 * placeholder. `deadlineSql` is the order's ship-by instant (a lateral column
 * where the caller already has one, else `sqlOrderTestDeadlineAt`); `signals`
 * the assignee / picker subjects (live probes unless the caller joined facts).
 */
export function sqlDeskRefinementClauses(
  r: DeskRefinements,
  bind: (value: unknown) => string,
  orderAlias = 'o',
  deadlineSql = sqlOrderTestDeadlineAt(orderAlias),
  signals?: Pick<OrderStageSignals, 'pickedBy' | 'pickerId' | 'packerId'>,
): string[] {
  const o = alias(orderAlias);
  const out: string[] = [];
  if (r.packedBy != null) out.push(`${signals?.packerId ?? sqlOrderPackAssigneeId(o)} = ${paramRef(bind(r.packedBy))}`);
  if (r.pickerId != null) out.push(`${signals?.pickerId ?? sqlOrderPickAssigneeId(o)} = ${paramRef(bind(r.pickerId))}`);
  if (r.pickedBy != null) out.push(`${signals?.pickedBy ?? sqlOrderPickedByStaffId(o)} = ${paramRef(bind(r.pickedBy))}`);
  if (r.orderFrom) out.push(sqlWarehouseDayOnOrAfter(`${o}.order_date`, bind(r.orderFrom)));
  if (r.orderTo) out.push(sqlWarehouseDayOnOrBefore(`${o}.order_date`, bind(r.orderTo)));
  // A NULL ship-by fails both comparisons, so either bound drops unscheduled orders.
  if (r.shipByFrom) out.push(sqlWarehouseDayOnOrAfter(deadlineSql, bind(r.shipByFrom)));
  if (r.shipByTo) out.push(sqlWarehouseDayOnOrBefore(deadlineSql, bind(r.shipByTo)));
  return out;
}

/**
 * Which TEST assignment's `deadline_at` is an order's ship-by: live work
 * first (IN_PROGRESS › ASSIGNED › OPEN › DONE › anything else), then the most
 * recently touched. `/api/orders` ranks with it (its `wa_deadline` projection,
 * which the desk's aging / must-ship filters read) and so do the nav facets.
 */
export function WA_TEST_DEADLINE_RANK_ORDER_SQL(waAlias = 'wa'): string {
  const wa = alias(waAlias);
  return `CASE ${wa}.status
                WHEN 'IN_PROGRESS' THEN 1
                WHEN 'ASSIGNED' THEN 2
                WHEN 'OPEN' THEN 3
                WHEN 'DONE' THEN 4
                ELSE 5
              END,
              ${wa}.updated_at DESC,
              ${wa}.id DESC`;
}

/** An order's ship-by instant (the top-ranked TEST assignment's deadline), as a scalar subquery. */
export function sqlOrderTestDeadlineAt(orderAlias = 'o'): string {
  const o = alias(orderAlias);
  return `(
      SELECT wa_dl.deadline_at
        FROM work_assignments wa_dl
       WHERE wa_dl.organization_id = ${o}.organization_id
         AND wa_dl.entity_type = 'ORDER'
         AND wa_dl.entity_id = ${o}.id
         AND wa_dl.work_type = 'TEST'
       ORDER BY ${WA_TEST_DEADLINE_RANK_ORDER_SQL('wa_dl')}
       LIMIT 1
    )`;
}

export const DESK_AGING_BUCKETS = ['overdue', 'today', 'upcoming', 'unscheduled'] as const;
export type DeskAgingBucket = (typeof DESK_AGING_BUCKETS)[number];

/**
 * `?aging=` bucket of a ship-by instant, on the warehouse's civil calendar:
 * no deadline → unscheduled; before today → overdue; today; after → upcoming.
 * `?late=1` (must ship) is overdue ∪ today. `deadlineSql` is any timestamptz
 * expression (e.g. `sqlOrderTestDeadlineAt('o')`).
 */
export function sqlDeskAgingBucket(deadlineSql: string): string {
  const day = `timezone('${WAREHOUSE_TIME_ZONE}', ${deadlineSql})::date`;
  const today = `timezone('${WAREHOUSE_TIME_ZONE}', NOW())::date`;
  return `CASE
        WHEN ${deadlineSql} IS NULL THEN 'unscheduled'
        WHEN ${day} < ${today} THEN 'overdue'
        WHEN ${day} = ${today} THEN 'today'
        ELSE 'upcoming'
      END`;
}

/**
 * "Shipped today" — PACK-station activity rows in the org's local day
 * (`organizations.settings.timezone`; an unset or unknown zone falls back to
 * UTC), as a scalar subquery. desk-counts `shippedToday` and queue-counts
 * share it. The day is a timestamptz range (DST-exact: the upper bound is the
 * next local midnight) computed once in a MATERIALIZED CTE, so the bounds reach
 * the index scan as plain values — `timezone()` is not leakproof, and inline
 * it could not be an index condition under forced RLS.
 * `orgParam` / `staffParam` are bind placeholders, e.g. `$1`.
 */
export function sqlShippedTodayCount(orgParam: string, staffParam?: string): string {
  if (!SQL_PARAM_REF.test(orgParam)) throw new Error(`invalid SQL param ref: ${orgParam}`);
  if (staffParam !== undefined && !SQL_PARAM_REF.test(staffParam)) {
    throw new Error(`invalid SQL param ref: ${staffParam}`);
  }
  const staffClause = staffParam ? `\n         AND sal.staff_id = ${staffParam}` : '';
  return `(
      WITH shipped_day AS MATERIALIZED (
        SELECT (date_trunc('day', NOW() AT TIME ZONE z.name) AT TIME ZONE z.name) AS lo,
               ((date_trunc('day', NOW() AT TIME ZONE z.name) + INTERVAL '1 day') AT TIME ZONE z.name) AS hi
          FROM (
            SELECT COALESCE((
              SELECT tzn.name
                FROM organizations org
                JOIN pg_timezone_names tzn ON tzn.name = org.settings->>'timezone'
               WHERE org.id = ${orgParam}
               LIMIT 1
            ), 'UTC') AS name
            OFFSET 0
          ) z
      )
      SELECT COUNT(*)::int
        FROM shipped_day d
        JOIN station_activity_logs sal
          ON sal.created_at >= d.lo
         AND sal.created_at < d.hi
       WHERE sal.organization_id = ${orgParam}
         AND sal.station = 'PACK'${staffClause}
    )`;
}
