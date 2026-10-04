/**
 * Outbound lane memberships for the Live feed — one lane per package, its
 * CURRENT state (operator 2026-10-03). The lanes partition the pipeline:
 *   - out-to-pack = Allocate's To-ship scope (`sqlOrderInWarehouseToShip`)
 *     with no pack stage and no pack / stage scan on its shipment, in ORDERS
 *     (counter-pickup orders tagged `pickup`);
 *   - out-packed = packed (or staged) and still in the building: no
 *     SHIP_CONFIRM, no carrier movement (`SHIPPED_BY_CARRIER_SQL`) — packages
 *     by shipment; counter-pickup orders packed in the To-ship scope (tagged
 *     `pickup`); and pack scans no shipment or order answers to (`unlinked`);
 *   - out-scanned-out = a SHIP_CONFIRM and no carrier movement — terminal for
 *     untracked carriers; a tracked one a day past scan-out is flagged
 *     `noCarrierScan`;
 *   - out-in-transit = the carrier moved it and has not delivered it;
 *   - out-delivered = `stn.is_delivered`;
 *   - out-sold-in-person = counter visits paid and Square walk-in sales tied
 *     to no visit.
 * The carrier lanes hold OUTBOUND packages only: one our pack / dock station
 * touched, or one carrying an order (directly or through an ORDER link).
 * Every package carries its lens instants (`packed_at`, `scanned_out_at`,
 * `delivered_at`) from the shared `lf_ship` facts.
 */

import 'server-only';
import { ORDER_STAGE_FACTS_JOIN, ORDER_STAGE_FACTS_SIGNALS } from '@/lib/orders/order-stage-facts';
import {
  sqlDeskAgingBucket,
  sqlOrderDeskStage,
  sqlOrderInWarehouseToShip,
  sqlOrderTestDeadlineAt,
} from '@/lib/orders/desk-view-sql';
import { sqlStationActivityMatchesOrder } from '@/lib/orders/order-grain-sql';
import { ENABLED_SYNC_CARRIERS } from '@/lib/shipping/enabled-carriers';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { PACK_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';
import { PICKUP_FULFILLMENT_CHANNEL } from '@/lib/orders/release-gates';
import type { LiveFeedStatusId, LiveFeedStatusSpec } from '@/lib/live-feed/statuses';
import {
  feedAgingSql,
  FEED_CARRIER_SQL,
  FEED_REFS,
  feedRowSql,
  type FeedMembership,
} from '@/lib/live-feed/feed-sql';

const R = FEED_REFS;

/** A scanned-out package on a tracked carrier with no carrier scan this long after scan-out is flagged `noCarrierScan`. */
const NO_CARRIER_SCAN_AFTER = "interval '24 hours'";

/** When the carrier took the package. Carriers that skip ACCEPTED only stamp first in-transit. */
const CARRIER_TOOK_AT_SQL = 'COALESCE(stn.carrier_accepted_at, stn.first_in_transit_at)';

/** The carrier token, `UNKNOWN` when the row has no shipment. */
const CARRIER_OR_UNKNOWN_SQL = `CASE WHEN stn.id IS NULL THEN 'UNKNOWN' ELSE ${FEED_CARRIER_SQL} END`;

/** The carrier is one we poll (`ENABLED_SYNC_CARRIERS`) — it would report a carrier scan. */
const TRACKED_CARRIER_SQL = `(stn.id IS NOT NULL AND ${FEED_CARRIER_SQL} IN (${sqlInList(ENABLED_SYNC_CARRIERS)}))`;

/** A staffed PACK-station pack event over `sal` — the `packed` lens. */
const PACK_EVENT_SQL = (sal: string) => `${sal}.station = 'PACK'
        AND ${sal}.activity_type IN (${sqlInList(PACK_ACTIVITY_TYPES)})
        AND ${sal}.staff_id IS NOT NULL`;

/**
 * Per shipment, once per statement (`$1` org): the latest pack event (and its
 * staffer), the latest DOCK_STAGED and the latest SHIP_CONFIRM (and its
 * staffer) — every outbound lane reads its lens instants and its "still in the
 * building" test here. SHIP_CONFIRM counts as `sqlOrderHasShipConfirm` does
 * (any scan-out), so the To-ship scope and these lanes split on the same fact.
 */
export const OUTBOUND_SHIP_FACTS_CTE = `lf_ship AS MATERIALIZED (
      SELECT sal.shipment_id::bigint AS shipment_id,
             MAX(sal.created_at) FILTER (WHERE ${PACK_EVENT_SQL('sal')}) AS packed_at,
             (array_agg(sal.staff_id ORDER BY sal.created_at DESC, sal.id DESC) FILTER (WHERE ${PACK_EVENT_SQL('sal')}))[1]::int AS packed_by,
             MAX(sal.created_at) FILTER (WHERE sal.activity_type = 'DOCK_STAGED') AS staged_at,
             MAX(sal.created_at) FILTER (WHERE sal.activity_type = 'SHIP_CONFIRM') AS scanned_out_at,
             (array_agg(sal.staff_id ORDER BY sal.created_at DESC, sal.id DESC) FILTER (WHERE sal.activity_type = 'SHIP_CONFIRM'))[1]::int AS scanned_out_by
        FROM station_activity_logs sal
       WHERE sal.organization_id = ${R.org}
         AND sal.shipment_id IS NOT NULL
         AND ((${PACK_EVENT_SQL('sal')}) OR sal.activity_type IN ('DOCK_STAGED', 'SHIP_CONFIRM'))
       GROUP BY 1
    )`;

/** The shipment `idSql` was packed or staged (it left To pack). */
function shipmentPackedOrStagedSql(idSql: string): string {
  return `EXISTS (
          SELECT 1 FROM lf_ship f_ps
           WHERE f_ps.shipment_id = ${idSql}
             AND (f_ps.packed_at IS NOT NULL OR f_ps.staged_at IS NOT NULL)
        )`;
}

/**
 * An order the customer takes across the counter: a counter pickup
 * (`fulfillment_channel = 'PICKUP'`, release-gates.ts) or a Square POS order
 * (`account_source = 'square'`, connectors/square.ts). Every other order ships.
 */
function inPersonOrderSql(o: string): string {
  return `(${o}.fulfillment_channel = '${PICKUP_FULFILLMENT_CHANNEL}' OR LOWER(BTRIM(COALESCE(${o}.account_source, ''))) = 'square')`;
}

/** A ship-by instant → `late` (overdue) / `due_today`, else null — the To-ship desk's `?aging=` buckets. */
function shipByUrgencySql(deadlineSql: string): string {
  return `CASE ${sqlDeskAgingBucket(deadlineSql)} WHEN 'overdue' THEN 'late' WHEN 'today' THEN 'due_today' END`;
}

/**
 * An outbound package over `stn` (with `lf_ship f` joined): our pack / dock
 * station touched it, or it carries an order (directly or through an ORDER
 * shipment link).
 */
const OUTBOUND_OWNED_SQL = `(
         f.shipment_id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM orders o_out
            WHERE o_out.organization_id = stn.organization_id
              AND o_out.shipment_id = stn.id
         )
         OR EXISTS (
           SELECT 1 FROM shipment_links sl_out
            WHERE sl_out.organization_id = stn.organization_id
              AND sl_out.shipment_id = stn.id
              AND sl_out.owner_type = 'ORDER'
         )
       )`;

/**
 * Allocate's `?stage=packed` online rows (the To-ship scope ∩ the pack
 * stage), grouped by PACKAGE, with the earliest order and ship-by.
 */
const PACKED_ORDERS_BY_SHIPMENT_SQL = `
      SELECT o.shipment_id::bigint AS shipment_id,
             MIN(o.id) AS order_row_id,
             MIN(COALESCE(osf.pack_activity_at, osf.packed_at)) AS packed_at,
             (array_agg(osf.packed_by ORDER BY COALESCE(osf.pack_activity_at, osf.packed_at) DESC NULLS LAST))[1]::int AS packer_id,
             MIN(${sqlOrderTestDeadlineAt('o')}) AS deadline_at
        FROM orders o
        LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
        ${ORDER_STAGE_FACTS_JOIN}
       WHERE o.organization_id = ${R.org}
         AND o.shipment_id IS NOT NULL
         AND ${sqlOrderInWarehouseToShip('o')}
         AND ${sqlOrderDeskStage('packed', 'o', ORDER_STAGE_FACTS_SIGNALS)}
         AND NOT ${inPersonOrderSql('o')}
       GROUP BY o.shipment_id`;

/** The customer's name on order `o` (customers `c` joined). */
const ORDER_CUSTOMER_SQL = `COALESCE(NULLIF(BTRIM(c.display_name), ''), NULLIF(BTRIM(c.customer_name), ''))`;

const OUTBOUND_MEMBERSHIP_SQL: Readonly<Record<Exclude<LiveFeedStatusId, `in-${string}`>, string>> = {
  /**
   * Labelled (or counter-pickup), still in the building, no pack stage and
   * no pack / stage scan on its shipment — one row per ORDER; the assignee is
   * the live packer (else picker). Entered = the order date.
   */
  'out-to-pack': `
    SELECT ${feedRowSql({
      key: `'o:' || o.id::text`,
      at: 'COALESCE(o.order_date, o.created_at)',
      staff_id: 'COALESCE(osf.packer_id, osf.picker_id)',
      channel: `CASE WHEN ${inPersonOrderSql('o')} THEN 'in_person' ELSE 'online' END`,
      carrier: CARRIER_OR_UNKNOWN_SQL,
      tracking: 'stn.tracking_number_raw',
      order_row_id: 'o.id',
      shipment_id: 'o.shipment_id',
      urgency: shipByUrgencySql('dl.deadline_at'),
      sub: `CASE WHEN ${inPersonOrderSql('o')} THEN 'PICKUP_ORDER' END`,
      flags: `CASE WHEN ${inPersonOrderSql('o')} THEN ARRAY['pickup'] ELSE ARRAY[]::text[] END`,
    })}
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      ${ORDER_STAGE_FACTS_JOIN}
      LEFT JOIN LATERAL (SELECT ${sqlOrderTestDeadlineAt('o')} AS deadline_at) dl ON TRUE
     WHERE o.organization_id = ${R.org}
       AND ${sqlOrderInWarehouseToShip('o')}
       AND NOT ${sqlOrderDeskStage('packed', 'o', ORDER_STAGE_FACTS_SIGNALS)}
       AND NOT ${shipmentPackedOrStagedSql('o.shipment_id')}`,

  /**
   * Packed and still here. Three parts, one row each:
   *   - PACKAGES (online): a shipment with a pack or stage scan, or carrying
   *     a packed To-ship order — no SHIP_CONFIRM, no carrier movement, no
   *     counter-pickup order aboard. Entered = its latest pack scan (else the
   *     order's pack fact, else staging); `sub = 'staged'` once staged.
   *   - COUNTER-PICKUP ORDERS in the To-ship scope with a pack stage (or a
   *     pack / stage scan on their shipment), waiting for the customer —
   *     tagged `pickup`. No handover event exists anywhere: one leaves only
   *     when it leaves the To-ship scope.
   *   - UNLINKED pack scans: no shipment and no order answers to them (a
   *     scanned reference). Their only fact is the scan, so they are never
   *     carried over (`carries = false`).
   */
  'out-packed': `
    SELECT ${feedRowSql({
      key: `'s:' || pkg.shipment_id::text`,
      at: 'COALESCE(f.packed_at, pw.packed_at, f.staged_at)',
      staff_id: 'COALESCE(f.packed_by, pw.packer_id)',
      channel: `'online'`,
      carrier: CARRIER_OR_UNKNOWN_SQL,
      tracking: 'stn.tracking_number_raw',
      order_row_id: 'pw.order_row_id',
      shipment_id: 'pkg.shipment_id',
      urgency: `COALESCE(${shipByUrgencySql('pw.deadline_at')}, ${feedAgingSql('COALESCE(f.packed_at, pw.packed_at, f.staged_at)')})`,
      sub: `CASE WHEN f.staged_at IS NOT NULL THEN 'staged' END`,
      packed_at: 'f.packed_at',
      flags: 'ARRAY[]::text[]',
    })}
      FROM (
        SELECT f0.shipment_id FROM lf_ship f0
         WHERE (f0.packed_at IS NOT NULL OR f0.staged_at IS NOT NULL) AND f0.scanned_out_at IS NULL
        UNION
        SELECT pw0.shipment_id FROM (${PACKED_ORDERS_BY_SHIPMENT_SQL}
        ) pw0
      ) pkg
      LEFT JOIN lf_ship f ON f.shipment_id = pkg.shipment_id
      LEFT JOIN (${PACKED_ORDERS_BY_SHIPMENT_SQL}
      ) pw ON pw.shipment_id = pkg.shipment_id
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = pkg.shipment_id AND stn.organization_id = ${R.org}
     WHERE f.scanned_out_at IS NULL
       AND NOT ${SHIPPED_BY_CARRIER_SQL}
       AND NOT EXISTS (
         SELECT 1 FROM orders o_ip
          WHERE o_ip.organization_id = ${R.org}
            AND o_ip.shipment_id = pkg.shipment_id
            AND ${inPersonOrderSql('o_ip')}
       )
    UNION ALL
    SELECT ${feedRowSql({
      key: `'o:' || o.id::text`,
      at: 'COALESCE(osf.pack_activity_at, osf.packed_at, opk.packed_at, f.packed_at, f.staged_at)',
      staff_id: 'COALESCE(osf.packed_by, f.packed_by)',
      channel: `'in_person'`,
      order_row_id: 'o.id',
      shipment_id: 'o.shipment_id',
      customer: ORDER_CUSTOMER_SQL,
      urgency: `COALESCE(${shipByUrgencySql('dl.deadline_at')}, ${feedAgingSql('COALESCE(osf.pack_activity_at, osf.packed_at, opk.packed_at, f.packed_at, f.staged_at)')})`,
      sub: `'PICKUP_ORDER'`,
      packed_at: 'COALESCE(opk.packed_at, f.packed_at)',
      flags: `ARRAY['pickup']`,
    })}
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      ${ORDER_STAGE_FACTS_JOIN}
      LEFT JOIN lf_ship f ON f.shipment_id = o.shipment_id
      LEFT JOIN LATERAL (
        SELECT MAX(sal.created_at) AS packed_at
          FROM station_activity_logs sal
         WHERE ${PACK_EVENT_SQL('sal')}
           AND ${sqlStationActivityMatchesOrder('sal', 'o')}
      ) opk ON TRUE
      LEFT JOIN LATERAL (SELECT ${sqlOrderTestDeadlineAt('o')} AS deadline_at) dl ON TRUE
      LEFT JOIN customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
     WHERE o.organization_id = ${R.org}
       AND ${inPersonOrderSql('o')}
       AND ${sqlOrderInWarehouseToShip('o')}
       AND (${sqlOrderDeskStage('packed', 'o', ORDER_STAGE_FACTS_SIGNALS)} OR ${shipmentPackedOrStagedSql('o.shipment_id')})
    UNION ALL
    SELECT ${feedRowSql({
      key: 'ul.key',
      at: 'ul.packed_at',
      staff_id: 'ul.staff_id',
      channel: `'online'`,
      carrier: `'UNKNOWN'`,
      urgency: feedAgingSql('ul.packed_at'),
      sub: `'unlinked'`,
      packed_at: 'ul.packed_at',
      carries: 'false',
      flags: 'ARRAY[]::text[]',
    })}
      FROM (
        SELECT DISTINCT ON (u.key) u.key, u.packed_at, u.staff_id
          FROM (
            SELECT COALESCE('r:' || NULLIF(UPPER(BTRIM(sal.scan_ref)), ''), 'l:' || sal.id::text) AS key,
                   sal.id, sal.created_at AS packed_at, sal.staff_id::int AS staff_id
              FROM station_activity_logs sal
             WHERE sal.organization_id = ${R.org}
               AND ${PACK_EVENT_SQL('sal')}
               AND sal.shipment_id IS NULL
               AND sal.order_row_id IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM orders o_ul
                  WHERE o_ul.organization_id = sal.organization_id
                    AND o_ul.order_id = sal.ext_order_id
               )
          ) u
         ORDER BY u.key, u.packed_at DESC, u.id DESC
      ) ul`,

  /**
   * Scanned out at the dock and the carrier has not moved it. On a carrier we
   * do not poll this is terminal (never carried over: it would sit here
   * forever); on a tracked one, a day with no carrier scan flags it.
   */
  'out-scanned-out': `
    SELECT ${feedRowSql({
      key: `'s:' || f.shipment_id::text`,
      at: 'f.scanned_out_at',
      staff_id: 'f.scanned_out_by',
      carrier: CARRIER_OR_UNKNOWN_SQL,
      tracking: 'stn.tracking_number_raw',
      shipment_id: 'f.shipment_id',
      urgency: `CASE WHEN ${TRACKED_CARRIER_SQL} AND f.scanned_out_at < now() - ${NO_CARRIER_SCAN_AFTER} THEN 'aging' END`,
      packed_at: 'f.packed_at',
      scanned_out_at: 'f.scanned_out_at',
      carries: TRACKED_CARRIER_SQL,
      flags: `CASE WHEN ${TRACKED_CARRIER_SQL} AND f.scanned_out_at < now() - ${NO_CARRIER_SCAN_AFTER}
                THEN ARRAY['noCarrierScan'] ELSE ARRAY[]::text[] END`,
    })}
      FROM lf_ship f
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = f.shipment_id AND stn.organization_id = ${R.org}
     WHERE f.scanned_out_at IS NOT NULL
       AND NOT ${SHIPPED_BY_CARRIER_SQL}`,

  /** The carrier moved it and has not delivered it. Entered = the carrier taking it (else its latest event). */
  'out-in-transit': `
    SELECT ${feedRowSql({
      key: `'s:' || stn.id::text`,
      at: `COALESCE(${CARRIER_TOOK_AT_SQL}, stn.latest_event_at)`,
      staff_id: 'f.scanned_out_by',
      carrier: FEED_CARRIER_SQL,
      tracking: 'stn.tracking_number_raw',
      shipment_id: 'stn.id',
      urgency: `CASE WHEN stn.latest_status_category = 'OUT_FOR_DELIVERY' THEN 'due_today'
                     WHEN stn.has_exception = true THEN 'late' END`,
      sub: `CASE WHEN stn.latest_status_category = 'OUT_FOR_DELIVERY' THEN 'out_for_delivery'
                 WHEN stn.has_exception = true THEN 'stalled' END`,
      packed_at: 'f.packed_at',
      scanned_out_at: 'f.scanned_out_at',
      flags: 'ARRAY[]::text[]',
    })}
      FROM shipping_tracking_numbers stn
      LEFT JOIN lf_ship f ON f.shipment_id = stn.id
     WHERE stn.organization_id = ${R.org}
       AND ${SHIPPED_BY_CARRIER_SQL}
       AND NOT COALESCE(stn.is_delivered, false)
       AND ${OUTBOUND_OWNED_SQL}`,

  /** The carrier delivered it. Entered = delivery. */
  'out-delivered': `
    SELECT ${feedRowSql({
      key: `'s:' || stn.id::text`,
      at: 'stn.delivered_at',
      staff_id: 'f.scanned_out_by',
      carrier: FEED_CARRIER_SQL,
      tracking: 'stn.tracking_number_raw',
      shipment_id: 'stn.id',
      packed_at: 'f.packed_at',
      scanned_out_at: 'f.scanned_out_at',
      delivered_at: 'stn.delivered_at',
      flags: 'ARRAY[]::text[]',
    })}
      FROM shipping_tracking_numbers stn
      LEFT JOIN lf_ship f ON f.shipment_id = stn.id
     WHERE stn.organization_id = ${R.org}
       AND stn.is_delivered = true
       AND ${OUTBOUND_OWNED_SQL}`,

  /**
   * Sold across the counter: a counter visit paid or part-paid (its instant
   * = the linked Square payment's record, else the visit's last write —
   * `reconcileCounterPayment` stamps `updated_at` when it settles the visit;
   * its staff = the visit session's claiming staffer), plus a Square walk-in
   * sale tied to no visit (no staff id: Square names its creator as text).
   * One row per sale; only lens `entered` applies, so the window bounds it
   * inside (the outer rule repeats it).
   */
  'out-sold-in-person': `
    SELECT ${feedRowSql({
      key: `'ct:' || ct.id::text`,
      at: 'COALESCE(sq.created_at, ct.updated_at)',
      staff_id: 'cs.claimed_by_staff_id',
      record_id: 'ct.id::text',
      customer: `COALESCE(NULLIF(BTRIM(c.display_name), ''), NULLIF(BTRIM(c.customer_name), ''), NULLIF(BTRIM(cs.customer_name), ''))`,
      reason: `CASE ct.status WHEN 'partially_paid' THEN 'Part paid' END`,
      sub: `'COUNTER'`,
      flags: 'ARRAY[]::text[]',
    })}
      FROM counter_transactions ct
      LEFT JOIN LATERAL (
        SELECT s.created_at FROM square_transactions s
         WHERE s.organization_id = ct.organization_id AND s.counter_transaction_id = ct.id AND s.deleted_at IS NULL
         ORDER BY s.created_at DESC NULLS LAST LIMIT 1
      ) sq ON TRUE
      LEFT JOIN LATERAL (
        SELECT cs0.claimed_by_staff_id, cs0.customer_name FROM counter_sessions cs0
         WHERE cs0.organization_id = ct.organization_id AND cs0.counter_transaction_id = ct.id
         ORDER BY cs0.submitted_at DESC NULLS LAST, cs0.id DESC LIMIT 1
      ) cs ON TRUE
      LEFT JOIN customers c ON c.id = ct.customer_id AND c.organization_id = ct.organization_id
     WHERE ct.organization_id = ${R.org}
       AND ct.status IN ('paid', 'partially_paid')
       AND COALESCE(sq.created_at, ct.updated_at) >= ${R.from}::timestamptz
       AND COALESCE(sq.created_at, ct.updated_at) <  ${R.to}::timestamptz
    UNION ALL
    SELECT ${feedRowSql({
      key: `'sq:' || s.id::text`,
      at: 's.created_at',
      record_id: 's.id::text',
      customer: `NULLIF(BTRIM(s.customer_name), '')`,
      sub: `'SQUARE'`,
      flags: 'ARRAY[]::text[]',
    })}
      FROM square_transactions s
     WHERE s.organization_id = ${R.org}
       AND s.deleted_at IS NULL
       AND s.counter_transaction_id IS NULL
       AND COALESCE(s.order_source, 'walk_in_sale') = 'walk_in_sale'
       AND COALESCE(s.status, 'completed') = 'completed'
       AND s.created_at >= ${R.from}::timestamptz
       AND s.created_at <  ${R.to}::timestamptz`,
};

/** A staffed dock scan-out — the trail's Scanned out instant (Fulfilled's). */
function staffedShipConfirm(alias: string): string {
  return `${alias}.activity_type = 'SHIP_CONFIRM'
        AND ${alias}.staff_id IS NOT NULL
        AND ${alias}.staff_id > 0
        AND ${alias}.shipment_id IS NOT NULL`;
}

/**
 * The stage trail of each shipment in the bound `bigint[]` `shipmentIdsRef`
 * (`$1` org): the latest pack event, the latest staffed scan-out, the carrier
 * taking it and delivery, by indexed per-shipment lookups (the Board paints
 * at most a column cap of them).
 */
export function outboundTrailsSql(shipmentIdsRef: string): string {
  return `SELECT t.shipment_id,
           (SELECT MAX(pk.created_at) FROM station_activity_logs pk
             WHERE pk.organization_id = ${R.org} AND pk.shipment_id = t.shipment_id
               AND pk.station = 'PACK' AND pk.activity_type IN (${sqlInList(PACK_ACTIVITY_TYPES)})) AS packed_at,
           (SELECT MAX(so.created_at) FROM station_activity_logs so
             WHERE so.organization_id = ${R.org} AND so.shipment_id = t.shipment_id AND ${staffedShipConfirm('so')}) AS scanned_out_at,
           ${CARRIER_TOOK_AT_SQL} AS carrier_at,
           CASE WHEN stn.is_delivered THEN stn.delivered_at END AS delivered_at
      FROM (SELECT DISTINCT unnest(${shipmentIdsRef}::bigint[]) AS shipment_id) t
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = t.shipment_id AND stn.organization_id = ${R.org}`;
}

/** The outbound memberships of `specs` (lanes with no outbound membership are skipped). They read {@link OUTBOUND_SHIP_FACTS_CTE}. */
export function outboundMemberships(specs: readonly LiveFeedStatusSpec[]): FeedMembership[] {
  return specs.flatMap(({ id, kind, channels, carrier, groupBy }) => {
    const sql = (OUTBOUND_MEMBERSHIP_SQL as Readonly<Partial<Record<LiveFeedStatusId, string>>>)[id];
    return sql ? [{ id, kind, channels, carrier, groupBy, sql }] : [];
  });
}
