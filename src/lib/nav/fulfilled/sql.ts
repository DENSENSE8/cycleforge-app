/**
 * The Fulfilled enumeration — ONE set-based statement over our tables that
 * lists every shipped order line of the org with its packages and every fact
 * the sheet paints (`GET /api/nav/fulfilled`). One row per (order line,
 * owned package); a line with no package (channel-shipped, no tracking) is
 * one row with a null package. The service groups rows to the line or order
 * grain and decides each package's bucket (`./bucket.ts`).
 *
 * ROWS (operator 2026-10-05):
 * - scanned out: a staffed dock `SHIP_CONFIRM` on any package the line owns
 *   (`o.shipment_id` ∪ `shipment_links` ORDER, org-scoped);
 * - scanned out, no order: the same `SHIP_CONFIRM` on a shipment no order owns
 *   (an FBA carton, a forgotten pack, any other label). One row, keyed `scan:<id>`;
 * - channel-shipped, never scanned: `orders.status = 'shipped'` with no
 *   SHIP_CONFIRM and no completed packer log (`osf.packed_at`) — shipped
 *   outside the dock (mostly ShipStation). Scan source = none.
 *
 * Scan source: none when never scanned out; else Backfill when the scan-out's
 * stamp is backdated (`sqlScanOutBackdated`, the one rule the shipment record
 * reads too), else Live.
 *
 * Hand-off (per package) = the scan-out, else the ShipStation ship date, else
 * label created, else the carrier's acceptance. The window reads one instant
 * per ORDER NUMBER, so both grains hold the same orders: shipped = the latest
 * hand-off, delivered = the latest delivery, ordered = the earliest
 * `placedElseImportedSql` (85% of order_date is NULL), ship-by =
 * the earliest TEST deadline. Find (`q`) keeps every row of an order number
 * any row of which matches (order # incl. last 8 / chip face, tracking incl.
 * last 8 / key18, SKU, title, customer).
 *
 * Customer half: the order's post-purchase check-in
 * (`order_support_follow_ups`, program `post_purchase`) is keyed to the
 * order's REPRESENTATIVE line (lowest `orders.id` of the same order number +
 * storefront, `REPRESENTATIVE_ORDER_ID_SQL`), so it joins every line of that
 * order through the same match key; the latest inbound message's instant is
 * its reply.
 *
 * Every predicate names the org: the owner role bypasses RLS, so the
 * predicate is the scope. Set-based throughout — each side table (scan-outs,
 * TEST deadlines, ShipStation refs, carrier events, returns, check-ins) is
 * read once as a CTE and hash-joined on ids; no per-row lateral.
 */

import type { FulfilledAxis } from '@/lib/outbound/fulfilled-params';
import { sqlScanOutBackdated } from '@/lib/outbound/scan-out-provenance';
import { WA_TEST_DEADLINE_RANK_ORDER_SQL } from '@/lib/orders/desk-view-sql';
import { sqlIdentifierEqualsQuery } from '@/lib/search/order-number-match';
import { sqlTrackingNumberMatches } from '@/lib/search/order-tracking-match-sql';
import type { OrgId } from '@/lib/tenancy/constants';
import { orderTrackingMatchKeys, trackingDigitsLast8Strict } from '@/lib/tracking-format';
import { escapeLike } from '@/lib/sql-like';
import { SUPPORT_CHECK_IN_PROGRAM } from '@/lib/support/check-ins/config';
import { accountSourceAccountLabelSql } from '@/lib/orders/account-source';
import { pickedByFromRow, type PickedBy } from '@/lib/picking/picked-by';
import {
  CHECK_IN_OUTCOMES,
  ORDER_CHECK_IN_STATES,
  type CheckInOutcome,
  type OrderCheckInState,
} from '@/lib/support/conversation/model';
import { placedElseImportedSql } from '@/lib/orders/order-dates';

/** The window on one axis as instants (PT civil days resolved by the service); null = unbounded. */
export interface FulfilledWindow {
  axis: FulfilledAxis;
  /** Start of the `from` PT day, UTC ISO (inclusive). */
  fromAt: string | null;
  /** Start of the PT day after `to`, UTC ISO (exclusive). */
  toBefore: string | null;
}

/** The order's post-purchase check-in (`order_support_follow_ups`) as the statement returns it. */
export interface FulfilledCheckInRow {
  state: OrderCheckInState;
  supportItemId: number | null;
  /** What started the check-in clock (delivery, pickup, or the shipped fallback). */
  triggerAt: string | null;
  dueAt: string | null;
  contactedAt: string | null;
  nextFollowUpAt: string | null;
  /** The latest inbound customer message's instant. */
  repliedAt: string | null;
  closedAt: string | null;
  outcome: CheckInOutcome | null;
}

/** One (order line, package) row as the statement returns it. Stamps are ISO strings or null. */
export interface FulfilledPackageRow {
  orderRowId: number;
  /** The channel order # (`orders.order_id`), else `#<orders.id>`. */
  orderKey: string;
  orderId: string | null;
  /** Canonical `account_source` (src/lib/orders/account-source.ts); null when blank. */
  channel: string | null;
  /** The org catalog's label for the seller account `channel` names (`USAV`), else null. */
  channelAccountLabel: string | null;
  channelStatus: string | null;
  orderedAt: string | null;
  qty: number | null;
  saleAmount: number | null;
  customer: string | null;
  title: string | null;
  sku: string | null;
  shipByDate: string | null;
  shipByAt: string | null;
  packedAt: string | null;
  packerId: number | null;
  packerName: string | null;
  /** Who picked the line, and when (the picked-by resolver, `src/lib/picking/picked-by.ts`). */
  pickedAt: string | null;
  pickedBy: PickedBy | null;
  shipstationStatus: string | null;
  returnRef: string | null;
  // The package (all null when the line owns none).
  shipmentId: number | null;
  tracking: string | null;
  carrier: string | null;
  service: string | null;
  scannedAt: string | null;
  scannedById: number | null;
  scannedByName: string | null;
  /** The scan-out's stamp is backdated (`scanOutBackdated`); false when never scanned out. */
  scanBackdated: boolean;
  handOffAt: string | null;
  labelCreatedAt: string | null;
  labelCost: number | null;
  category: string | null;
  statusLabel: string | null;
  latestEventAt: string | null;
  carrierAcceptedAt: string | null;
  firstInTransitAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  isDelivered: boolean;
  estimatedDeliveryAt: string | null;
  /** The carrier's FIRST promised delivery instant (`first_estimated_delivery_at`); kept after delivery. */
  promisedAt: string | null;
  exceptionAt: string | null;
  hasException: boolean;
  isTerminal: boolean;
  sourceSystem: string | null;
  lastCheckedAt: string | null;
  consecutiveErrors: number;
  lastError: string | null;
  eventCount: number;
  /** The earliest ACCEPTED / IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED event. */
  firstMoveEventAt: string | null;
  attempts: number;
  exceptionCode: string | null;
  returnToSenderEvent: boolean;
  /** The latest event recorded from a poll — proof a poll succeeded. */
  lastEventRecordedAt: string | null;
  /** Where the latest placed carrier event happened (`City, ST`); null when no event names a place. */
  lastEventPlace: string | null;
  /** The order's check-in (same on every line of the order); null when none is projected. */
  checkIn: FulfilledCheckInRow | null;
}

/** Per-order axis instant (one per order number, so both grains window alike). */
const AXIS_SQL: Readonly<Record<FulfilledAxis, string>> = {
  shipped: 'max(r.hand_off_at)',
  delivered: 'max(r.delivered_at)',
  ordered: 'min(r.ordered_at)',
  shipBy: 'min(r.ship_by_at)',
};

/** Find parameters (`$4`–`$8`): text, LIKE pattern, tracking canonical / key18 / digits last-8. */
function findParams(q: string | null): unknown[] {
  const text = q?.trim() || null;
  if (!text) return [null, null, null, null, null];
  const keys = orderTrackingMatchKeys(text);
  return [text, `%${escapeLike(text)}%`, keys.exact, keys.key18, trackingDigitsLast8Strict(text)];
}

/**
 * The check-in match key of an `orders` row: its order number + storefront
 * (the representative rule, `REPRESENTATIVE_ORDER_ID_SQL`), or its own id when
 * the number is blank. `chr(31)` (unit separator) never appears in either.
 */
function checkInMatchKey(alias: string): string {
  return `CASE WHEN NULLIF(BTRIM(${alias}.order_id), '') IS NOT NULL
               THEN 'n' || chr(31) || ${alias}.order_id || chr(31) || COALESCE(${alias}.account_source, '')
               ELSE 'i' || chr(31) || ${alias}.id::text END`;
}

export function buildFulfilledSql(orgId: OrgId, window: FulfilledWindow, q: string | null) {
  const params: unknown[] = [orgId, window.fromAt, window.toBefore, ...findParams(q)];
  const trackingHit = sqlTrackingNumberMatches({
    stnAlias: 'stn',
    likeParam: '$5',
    canonicalParam: '$6',
    key18Param: "COALESCE($7, '')",
    last8Param: "COALESCE($8, '')",
  });
  const sql = `
    WITH ship_out AS MATERIALIZED (
      SELECT DISTINCT ON (so.shipment_id)
             so.shipment_id, so.created_at AS scanned_at, so.staff_id AS scanned_by,
             ${sqlScanOutBackdated('so')} AS scan_backdated
        FROM station_activity_logs so
       WHERE so.organization_id = $1
         AND so.activity_type = 'SHIP_CONFIRM'
         AND so.shipment_id IS NOT NULL
         AND so.staff_id > 0
       ORDER BY so.shipment_id, so.created_at DESC, so.id DESC
    ),
    owned AS MATERIALIZED (
      SELECT o.id AS order_row_id, o.shipment_id
        FROM orders o
       WHERE o.organization_id = $1 AND o.shipment_id IS NOT NULL
      UNION
      SELECT sl.owner_id, sl.shipment_id
        FROM shipment_links sl
       WHERE sl.organization_id = $1 AND sl.owner_type = 'ORDER'
    ),
    scanned AS MATERIALIZED (
      SELECT DISTINCT ow.order_row_id FROM owned ow JOIN ship_out so ON so.shipment_id = ow.shipment_id
    ),
    wa_deadline AS MATERIALIZED (
      SELECT DISTINCT ON (wa.entity_id) wa.entity_id, wa.deadline_at
        FROM work_assignments wa
       WHERE wa.organization_id = $1 AND wa.entity_type = 'ORDER' AND wa.work_type = 'TEST'
       ORDER BY wa.entity_id, ${WA_TEST_DEADLINE_RANK_ORDER_SQL('wa')}
    ),
    sor AS MATERIALIZED (
      SELECT DISTINCT ON (ref.order_row_id) ref.order_row_id, ref.shipstation_status, ref.customer_username
        FROM shipstation_order_refs ref
       WHERE ref.organization_id = $1 AND ref.order_row_id IS NOT NULL
       ORDER BY ref.order_row_id, ref.last_seen_at DESC NULLS LAST, ref.id DESC
    ),
    ss_label AS MATERIALIZED (
      SELECT s.id,
             s.order_row_id,
             UPPER(regexp_replace(COALESCE(s.tracking_number, ''), '[^A-Za-z0-9]', '', 'g')) AS tracking_key,
             s.ship_date,
             CASE WHEN s.ship_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                  THEN GREATEST(
                         left(s.ship_date, 10)::timestamp AT TIME ZONE 'America/Los_Angeles',
                         CASE WHEN s.create_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
                              THEN left(s.create_date, 19)::timestamp AT TIME ZONE 'America/Los_Angeles' END)
             END AS ship_at,
             CASE WHEN s.create_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
                  THEN left(s.create_date, 19)::timestamp AT TIME ZONE 'America/Los_Angeles' END AS created_at,
             NULLIF(BTRIM(s.service_code), '') AS service_code,
             s.shipment_cost + COALESCE(s.insurance_cost, 0) AS label_cost
        FROM shipstation_shipment_refs s
       WHERE s.organization_id = $1
         AND s.order_row_id IS NOT NULL
         AND NOT COALESCE(s.voided, false)
         AND NOT COALESCE(s.is_return_label, false)
    ),
    -- The package's ShipStation label is the one naming its tracking, else the line's latest.
    ss_by_tracking AS MATERIALIZED (
      SELECT DISTINCT ON (l.order_row_id, l.tracking_key) l.*
        FROM ss_label l
       WHERE l.tracking_key <> ''
       ORDER BY l.order_row_id, l.tracking_key, l.ship_date DESC NULLS LAST, l.id DESC
    ),
    ss_by_line AS MATERIALIZED (
      SELECT DISTINCT ON (l.order_row_id) l.*
        FROM ss_label l
       ORDER BY l.order_row_id, l.ship_date DESC NULLS LAST, l.id DESC
    ),
    -- Carrier events of the org's packages, one pass. Categories are the normalizer's upper-case
    -- words; text tests run only on the categories that carry them (attempts / return to sender).
    ev AS MATERIALIZED (
      SELECT e.shipment_id,
             count(*)::int AS n_events,
             min(e.event_occurred_at) FILTER (
               WHERE e.normalized_status_category IN ('ACCEPTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED')
             ) AS first_move_at,
             count(*) FILTER (
               WHERE (e.normalized_status_category = 'EXCEPTION' AND e.external_status_description ILIKE '%attempt%')
                  OR (e.carrier = 'UPS' AND e.external_status_code IN ('48', 'KX', '49', 'G3', '51', 'YD', 'ZM'))
                  OR (e.carrier = 'FEDEX' AND e.external_status_code = 'DE')
             )::int AS attempts,
             bool_or(
               e.normalized_status_category = 'RETURNED'
               OR (e.normalized_status_category IN ('EXCEPTION', 'DELIVERED') AND e.external_status_description ILIKE '%to%sender%')
               OR (e.carrier = 'UPS' AND e.external_status_code IN ('UA', 'KR', 'KT'))
             ) AS rts,
             max(e.event_recorded_at) AS last_recorded_at,
             -- The latest exception's code (FedEx keeps it in exception_code, UPS in its status code):
             -- max over "<20-char UTC stamp>|<code>", the code read back from character 22.
             substring(max(
               to_char(e.event_occurred_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS') || '|'
                 || COALESCE(NULLIF(BTRIM(e.exception_code), ''), NULLIF(BTRIM(e.external_status_code), ''))
             ) FILTER (WHERE e.normalized_status_category = 'EXCEPTION') FROM 22) AS exception_code,
             -- Where the latest placed event happened ("Anaheim, CA"), read back the same way.
             substring(max(
               to_char(e.event_occurred_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS') || '|'
                 || CONCAT_WS(', ', INITCAP(NULLIF(BTRIM(e.event_city), '')), UPPER(NULLIF(BTRIM(e.event_state), '')))
             ) FILTER (
               WHERE e.event_occurred_at IS NOT NULL
                 AND (NULLIF(BTRIM(e.event_city), '') IS NOT NULL OR NULLIF(BTRIM(e.event_state), '') IS NOT NULL)
             ) FROM 22) AS last_event_place
        FROM shipment_tracking_events e
       WHERE e.shipment_id IN (SELECT ow.shipment_id FROM owned ow)
       GROUP BY e.shipment_id
    ),
    ret AS MATERIALIZED (
      SELECT DISTINCT ON (rlr.source_order_id)
             rlr.source_order_id, COALESCE(NULLIF(BTRIM(rlr.rma_ref), ''), rlr.receiving_line_id::text) AS return_ref
        FROM receiving_line_return rlr
       WHERE rlr.organization_id = $1 AND rlr.source_order_id IS NOT NULL
       ORDER BY rlr.source_order_id, rlr.created_at DESC, rlr.receiving_line_id DESC
    ),
    -- The org's post-purchase check-ins, keyed like the order lines they belong to (the
    -- representative line holds the row; a stray non-representative row loses to it).
    check_in AS MATERIALIZED (
      SELECT DISTINCT ON (c.match_key) c.*
        FROM (
          SELECT ${checkInMatchKey('fo')} AS match_key,
                 f.order_id,
                 f.state,
                 f.support_ticket_id,
                 f.trigger_at,
                 f.due_at,
                 f.contacted_at,
                 f.next_follow_up_at,
                 f.closed_at,
                 f.outcome,
                 COALESCE(tm.occurred_at, tm.created_at) AS replied_at
            FROM order_support_follow_ups f
            JOIN orders fo ON fo.id = f.order_id AND fo.organization_id = $1
            LEFT JOIN thread_messages tm ON tm.id = f.latest_inbound_message_id AND tm.organization_id = $1
           WHERE f.organization_id = $1 AND f.program = '${SUPPORT_CHECK_IN_PROGRAM}'
        ) c
       ORDER BY c.match_key, c.order_id
    ),
    r AS MATERIALIZED (
      SELECT o.id AS order_row_id,
             COALESCE(NULLIF(BTRIM(o.order_id), ''), '#' || o.id) AS order_key,
             o.order_id,
             NULLIF(o.account_source, '') AS channel,
             ${accountSourceAccountLabelSql('o')} AS channel_account_label,
             o.status,
             ${placedElseImportedSql('o')} AS ordered_at,
             CASE WHEN o.quantity ~ '^\\s*[0-9]+(\\.[0-9]+)?\\s*$' THEN BTRIM(o.quantity)::numeric END AS qty,
             o.sale_amount,
             COALESCE(NULLIF(BTRIM(cust.display_name), ''), NULLIF(BTRIM(cust.customer_name), ''), NULLIF(BTRIM(sor.customer_username), '')) AS customer,
             COALESCE(sc.product_title, o.product_title) AS fact_title,
             COALESCE(sc.sku, o.sku) AS sku,
             to_char(wa.deadline_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD') AS ship_by_date,
             wa.deadline_at AS ship_by_at,
             COALESCE(osf.packed_at, osf.pack_activity_at) AS packed_at,
             COALESCE(osf.packed_by, osf.packer_id) AS packer_id,
             staff_packer.name AS packer_name,
             osf.picked_at,
             osf.picked_by,
             osf.picked_source,
             staff_picked.name AS picked_by_name,
             sor.shipstation_status,
             ret.return_ref,
             ow.shipment_id,
             stn.tracking_number_raw AS tracking_number,
             NULLIF(UPPER(BTRIM(stn.carrier)), '') AS carrier,
             COALESCE(ss_t.service_code, ss_l.service_code, NULLIF(BTRIM(o.service_level), '')) AS service,
             so.scanned_at,
             so.scanned_by,
             staff_scan.name AS scanned_by_name,
             COALESCE(so.scan_backdated, false) AS scan_backdated,
             COALESCE(so.scanned_at, ss_t.ship_at, ss_l.ship_at, stn.label_created_at, o.label_printed_at, ss_t.created_at, ss_l.created_at, stn.carrier_accepted_at) AS hand_off_at,
             COALESCE(stn.label_created_at, o.label_printed_at, ss_t.created_at, ss_l.created_at) AS label_created_at,
             COALESCE(ss_t.label_cost, ss_l.label_cost) AS label_cost,
             stn.latest_status_category,
             COALESCE(NULLIF(BTRIM(stn.latest_status_label), ''), NULLIF(BTRIM(stn.latest_status_description), '')) AS latest_status_label,
             stn.latest_event_at,
             stn.carrier_accepted_at,
             stn.first_in_transit_at,
             stn.out_for_delivery_at,
             stn.delivered_at,
             COALESCE(stn.is_delivered, false) AS is_delivered,
             stn.estimated_delivery_at,
             stn.first_estimated_delivery_at,
             stn.exception_at,
             COALESCE(stn.has_exception, false) AS has_exception,
             COALESCE(stn.is_terminal, false) AS is_terminal,
             stn.source_system,
             stn.last_checked_at,
             COALESCE(stn.consecutive_error_count, 0) AS consecutive_error_count,
             NULLIF(BTRIM(stn.last_error_message), '') AS last_error_message,
             COALESCE(ev.n_events, 0) AS n_events,
             ev.first_move_at,
             COALESCE(ev.attempts, 0) AS attempts,
             ev.exception_code,
             COALESCE(ev.rts, false) AS rts,
             ev.last_recorded_at,
             ev.last_event_place,
             ci.state AS check_in_state,
             ci.support_ticket_id AS check_in_ticket_id,
             ci.trigger_at AS check_in_trigger_at,
             ci.due_at AS check_in_due_at,
             ci.contacted_at AS check_in_contacted_at,
             ci.next_follow_up_at AS check_in_next_at,
             ci.replied_at AS check_in_replied_at,
             ci.closed_at AS check_in_closed_at,
             ci.outcome AS check_in_outcome,
             CASE WHEN $4::text IS NULL THEN true ELSE (
                  ${sqlIdentifierEqualsQuery('o.order_id', '$4')}
               OR o.order_id ILIKE $5
               OR COALESCE(sc.sku, o.sku) ILIKE $5
               OR COALESCE(sc.product_title, o.product_title) ILIKE $5
               OR COALESCE(cust.display_name, cust.customer_name, sor.customer_username) ILIKE $5
               OR (stn.id IS NOT NULL AND ${trackingHit})
             ) END AS find_hit
        FROM orders o
        LEFT JOIN scanned sc_out ON sc_out.order_row_id = o.id
        LEFT JOIN order_stage_facts osf ON osf.organization_id = o.organization_id AND osf.order_id = o.id
        LEFT JOIN owned ow ON ow.order_row_id = o.id
        LEFT JOIN ship_out so ON so.shipment_id = ow.shipment_id
        LEFT JOIN shipping_tracking_numbers stn ON stn.id = ow.shipment_id
        LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
        LEFT JOIN customers cust ON cust.id = o.customer_id AND cust.organization_id = o.organization_id
        LEFT JOIN wa_deadline wa ON wa.entity_id = o.id
        LEFT JOIN staff staff_packer
          ON staff_packer.id = COALESCE(osf.packed_by, osf.packer_id) AND staff_packer.organization_id = o.organization_id
        LEFT JOIN staff staff_picked ON staff_picked.id = osf.picked_by AND staff_picked.organization_id = o.organization_id
        LEFT JOIN staff staff_scan ON staff_scan.id = so.scanned_by AND staff_scan.organization_id = o.organization_id
        LEFT JOIN sor ON sor.order_row_id = o.id
        LEFT JOIN ss_by_tracking ss_t ON ss_t.order_row_id = o.id AND ss_t.tracking_key = stn.tracking_number_normalized
        LEFT JOIN ss_by_line ss_l ON ss_l.order_row_id = o.id
        LEFT JOIN ev ON ev.shipment_id = stn.id
        LEFT JOIN ret ON ret.source_order_id = o.order_id
        LEFT JOIN check_in ci ON ci.match_key = ${checkInMatchKey('o')}
       WHERE o.organization_id = $1
         AND (sc_out.order_row_id IS NOT NULL OR (LOWER(o.status) = 'shipped' AND osf.packed_at IS NULL))
      UNION ALL
      -- A staffed scan-out whose shipment no order owns. order_row_id is the
      -- negated shipment id so it cannot collide with orders.id.
      SELECT (-stn.id)::bigint,
             'scan:' || stn.id,
             stn.tracking_number_raw,
             NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             NULL, NULL, NULL, NULL,
             stn.id,
             stn.tracking_number_raw,
             NULLIF(UPPER(BTRIM(stn.carrier)), ''),
             NULL,
             so.scanned_at,
             so.scanned_by,
             staff_scan.name,
             COALESCE(so.scan_backdated, false),
             so.scanned_at,
             stn.label_created_at,
             NULL,
             stn.latest_status_category,
             COALESCE(NULLIF(BTRIM(stn.latest_status_label), ''), NULLIF(BTRIM(stn.latest_status_description), '')),
             stn.latest_event_at,
             stn.carrier_accepted_at,
             stn.first_in_transit_at,
             stn.out_for_delivery_at,
             stn.delivered_at,
             COALESCE(stn.is_delivered, false),
             stn.estimated_delivery_at,
             stn.first_estimated_delivery_at,
             stn.exception_at,
             COALESCE(stn.has_exception, false),
             COALESCE(stn.is_terminal, false),
             stn.source_system,
             stn.last_checked_at,
             COALESCE(stn.consecutive_error_count, 0),
             NULLIF(BTRIM(stn.last_error_message), ''),
             COALESCE(ev.n_events, 0),
             ev.first_move_at,
             COALESCE(ev.attempts, 0),
             ev.exception_code,
             COALESCE(ev.rts, false),
             ev.last_recorded_at,
             ev.last_event_place,
             NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             CASE WHEN $4::text IS NULL THEN true ELSE (
                  stn.tracking_number_raw ILIKE $5
               OR ${trackingHit}
             ) END
        FROM ship_out so
        JOIN shipping_tracking_numbers stn
          ON stn.id = so.shipment_id AND stn.organization_id = $1
        LEFT JOIN staff staff_scan
          ON staff_scan.id = so.scanned_by AND staff_scan.organization_id = $1
        LEFT JOIN ev ON ev.shipment_id = stn.id
       WHERE NOT EXISTS (SELECT 1 FROM owned ow WHERE ow.shipment_id = so.shipment_id)
    ),
    -- One axis instant + Find verdict per order number, so every row of a kept order stays.
    kept AS (
      SELECT r.order_key
        FROM r
       GROUP BY r.order_key
      HAVING bool_or(r.find_hit)
         AND ($2::timestamptz IS NULL OR ${AXIS_SQL[window.axis]} >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR ${AXIS_SQL[window.axis]} < $3::timestamptz)
    )
    SELECT r.*
      FROM r
      JOIN kept ON kept.order_key = r.order_key`;
  return { sql, params };
}

/** A wire stamp: node-pg hands timestamptz back as `Date`. To the second — the sheet paints minutes, and thousands of rows carry several. */
function stamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

const text = (value: unknown): string | null => (value == null ? null : String(value).trim() || null);

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function staffId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const isCheckInState = (value: string | null): value is OrderCheckInState =>
  value !== null && (ORDER_CHECK_IN_STATES as readonly string[]).includes(value);
const isCheckInOutcome = (value: string | null): value is CheckInOutcome =>
  value !== null && (CHECK_IN_OUTCOMES as readonly string[]).includes(value);

/** The row's check-in, or null when the order has none (or its state is a word this build does not know). */
function checkInOf(row: Record<string, unknown>): FulfilledCheckInRow | null {
  const state = text(row.check_in_state);
  if (!isCheckInState(state)) return null;
  const outcome = text(row.check_in_outcome);
  return {
    state,
    supportItemId: staffId(row.check_in_ticket_id),
    triggerAt: stamp(row.check_in_trigger_at),
    dueAt: stamp(row.check_in_due_at),
    contactedAt: stamp(row.check_in_contacted_at),
    nextFollowUpAt: stamp(row.check_in_next_at),
    repliedAt: stamp(row.check_in_replied_at),
    closedAt: stamp(row.check_in_closed_at),
    outcome: isCheckInOutcome(outcome) ? outcome : null,
  };
}

export function fulfilledPackageRowOf(row: Record<string, unknown>): FulfilledPackageRow {
  return {
    orderRowId: Number(row.order_row_id),
    orderKey: String(row.order_key),
    orderId: text(row.order_id),
    channel: text(row.channel),
    channelAccountLabel: text(row.channel_account_label),
    channelStatus: text(row.status),
    orderedAt: stamp(row.ordered_at),
    qty: num(row.qty),
    saleAmount: num(row.sale_amount),
    customer: text(row.customer),
    title: text(row.fact_title),
    sku: text(row.sku),
    shipByDate: text(row.ship_by_date),
    shipByAt: stamp(row.ship_by_at),
    packedAt: stamp(row.packed_at),
    packerId: staffId(row.packer_id),
    packerName: text(row.packer_name),
    pickedAt: stamp(row.picked_at),
    pickedBy: pickedByFromRow(row),
    shipstationStatus: text(row.shipstation_status),
    returnRef: text(row.return_ref),
    shipmentId: num(row.shipment_id),
    tracking: text(row.tracking_number),
    carrier: text(row.carrier),
    service: text(row.service),
    scannedAt: stamp(row.scanned_at),
    scannedById: staffId(row.scanned_by),
    scannedByName: text(row.scanned_by_name),
    scanBackdated: row.scan_backdated === true,
    handOffAt: stamp(row.hand_off_at),
    labelCreatedAt: stamp(row.label_created_at),
    labelCost: num(row.label_cost),
    category: text(row.latest_status_category)?.toUpperCase() ?? null,
    statusLabel: text(row.latest_status_label),
    latestEventAt: stamp(row.latest_event_at),
    carrierAcceptedAt: stamp(row.carrier_accepted_at),
    firstInTransitAt: stamp(row.first_in_transit_at),
    outForDeliveryAt: stamp(row.out_for_delivery_at),
    deliveredAt: stamp(row.delivered_at),
    isDelivered: row.is_delivered === true,
    estimatedDeliveryAt: stamp(row.estimated_delivery_at),
    promisedAt: stamp(row.first_estimated_delivery_at),
    exceptionAt: stamp(row.exception_at),
    hasException: row.has_exception === true,
    isTerminal: row.is_terminal === true,
    sourceSystem: text(row.source_system),
    lastCheckedAt: stamp(row.last_checked_at),
    consecutiveErrors: num(row.consecutive_error_count) ?? 0,
    lastError: text(row.last_error_message),
    eventCount: num(row.n_events) ?? 0,
    firstMoveEventAt: stamp(row.first_move_at),
    attempts: num(row.attempts) ?? 0,
    exceptionCode: text(row.exception_code),
    returnToSenderEvent: row.rts === true,
    lastEventRecordedAt: stamp(row.last_recorded_at),
    lastEventPlace: text(row.last_event_place),
    checkIn: checkInOf(row),
  };
}
