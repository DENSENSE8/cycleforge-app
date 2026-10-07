/**
 * The Records enumeration (`GET /api/nav/records`, docs/refactors/records/
 * PROMPT-records-sheet.md §Phase 2) — ONE set-based statement over our tables
 * that lists every LINE of the org, inbound and outbound together, with every
 * fact the sheet paints and the raw signals its statuses resolve from.
 *
 * - Outbound line = an `orders` row. Packages = `o.shipment_id` ∪
 *   `shipment_links` owner ORDER (org-scoped); scanned out = a staffed dock
 *   `SHIP_CONFIRM` on any of them (the Fulfilled reading); picked by =
 *   {@link PICKED_BY_LATERAL}; packed by = `order_stage_facts`; ship-by = the
 *   order's TEST deadline (`WA_TEST_DEADLINE_RANK_ORDER_SQL`); buyer =
 *   `customers` (else the ShipStation username); Placed / Imported from
 *   `order-dates.ts`; platform = canonical `account_source` + the catalog
 *   account label (`accountSourceAccountLabelSql`).
 * - Inbound line = a `receiving_line`. Packages = its own (`rl.shipment_id` ∪
 *   `shipment_links` owner RECEIVING_LINE), else its carton's
 *   (`receiving_carton.shipment_id` ∪ owner RECEIVING); PO / vendor from
 *   `receiving_line_zoho` + `zoho_po_mirror`, the marketplace order from
 *   `inbound_order`; unboxed / received by + at from the line and its
 *   carton's `receiving_unbox`.
 *
 * Price (measured, contract §Price notes): unit = `orders.unit_price`
 * (slice 6; NULL for collapsed multi-item ShipStation rows) /
 * `receiving_line.unit_cost_cents / 100`; line
 * total = unit × qty, else the outbound `sale_amount` of a ONE-line order
 * (a ShipStation row is the whole SS order); order total = the ShipStation
 * order total when linked, else the sum of the order's line totals when every
 * line has one — a window over ALL the org's lines, so a window cut never
 * shortens a total.
 *
 * Cut here: direction (permission), the date window on one axis, the event
 * (who did what, when), Find, and a pasted list (`matched_refs` = the paste
 * positions a line answers, by canonical key). Statuses, flags and facets are
 * the service's (`./service.ts`): the statement returns signals, never a
 * second status ladder. Every predicate names the org: the owner role
 * bypasses RLS, so the predicate is the scope.
 */

import { accountSourceAccountLabelSql } from '@/lib/orders/account-source';
import { WA_TEST_DEADLINE_RANK_ORDER_SQL } from '@/lib/orders/desk-view-sql';
import { placedElseImportedSql } from '@/lib/orders/order-dates';
import { noteMentionsToPlain } from '@/lib/orders/note-mentions';
import { PICKED_BY_IS_PICKED_SQL, PICKED_BY_LATERAL, pickedByFromRow, type PickedBy } from '@/lib/picking/picked-by';
import type { RecordsAxis, RecordsEvent } from '@/lib/nav/records/params';
import { sqlIdentifierEqualsQuery } from '@/lib/search/order-number-match';
import { sqlTrackingNumberMatches } from '@/lib/search/order-tracking-match-sql';
import { escapeLike } from '@/lib/sql-like';
import type { OrgId } from '@/lib/tenancy/constants';
import { orderTrackingMatchKeys, trackingDigitsLast8Strict } from '@/lib/tracking-format';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

/** What one read asks the statement for. Instants are UTC ISO (PT civil days resolved by the service). */
export interface RecordsSqlInput {
  outbound: boolean;
  inbound: boolean;
  axis: RecordsAxis;
  /** Start of the `from` PT day (inclusive); null = unbounded. */
  fromAt: string | null;
  /** Start of the PT day after `to` (exclusive); null = unbounded. */
  toBefore: string | null;
  event: RecordsEvent | null;
  eventBy: number | null;
  eventFromAt: string | null;
  eventToBefore: string | null;
  find: string | null;
  /** The pasted refs in paste order (the operator's strings); empty = Query mode. */
  refs: readonly string[];
  viewerStaffId: number | null;
  /**
   * Exactly these outbound lines (`orders.id`), whatever their dates — a
   * caller that decided the row set itself (Fulfilled: the shipped orders of
   * its window) and wants the Records facts of each. Null = every line the
   * other cuts keep.
   */
  orderIds?: readonly number[] | null;
}

/** One package a line owns, as the statement aggregates it. */
export interface RecordPackageRow {
  shipmentId: number;
  tracking: string | null;
  carrier: string | null;
  /** `latest_status_category`, upper-case. */
  category: string | null;
  statusLabel: string | null;
  latestEventAt: string | null;
  eta: string | null;
  deliveredAt: string | null;
  place: string | null;
  primary: boolean;
}

/** One line as the statement returns it. Stamps are ISO strings or null. */
export interface RecordLineRow {
  direction: 'outbound' | 'inbound';
  recordId: number;
  orderNumber: string | null;
  orderKey: string;
  itemNumber: string | null;
  skuCatalogId: number | null;
  title: string | null;
  sku: string | null;
  qty: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  orderTotal: number | null;
  /** Lines of the line's order (every line of the org, not only the window's). */
  orderLines: number;
  /** Canonical platform key (outbound `account_source`, inbound source); null when blank. */
  platform: string | null;
  /** The catalog account's label (`USAV`), outbound only. */
  platformAccountLabel: string | null;
  customer: string | null;
  vendor: string | null;
  po: string | null;
  channelStatus: string | null;
  placedAt: string | null;
  importedAt: string | null;
  /** Placed, else Imported (`placedElseImportedSql`); inbound: the PO / order date, else the line's landing. */
  orderedAt: string | null;
  shipByDate: string | null;
  shipByAt: string | null;
  pickedAt: string | null;
  pickedBy: PickedBy | null;
  packedAt: string | null;
  packer: { id: number | null; name: string | null } | null;
  scannedAt: string | null;
  scannedBy: { id: number | null; name: string | null } | null;
  /** The latest hand-off over the packages: scan-out, else carrier acceptance / first move / label. */
  shippedAt: string | null;
  unboxedAt: string | null;
  unboxedBy: { id: number | null; name: string | null } | null;
  receivedAt: string | null;
  receivedBy: { id: number | null; name: string | null } | null;
  unitsReceived: number | null;
  unitsExpected: number | null;
  /** The bench closed the receive (`received_done_at`). */
  receivedDone: boolean;
  inboundOrderId: number | null;
  cartonId: number | null;
  service: string | null;
  packages: RecordPackageRow[];
  // Raw signals (the service resolves statuses and flags through record-status / workflow-stages).
  buyerCancelled: boolean;
  scannedOut: boolean;
  /** `orders.release_state` (`isExceptionHeld` with `skuCatalogId`). */
  releaseState: string | null;
  outOfStock: boolean;
  /** The operator's Hold flag (`order_flags.flag = 'hold'`). */
  holdFlag: boolean;
  packed: boolean;
  picked: boolean;
  /** Inbound coarse status, stored (`receiving_line_status`) and fine (`workflow_status`). */
  lineStatus: string | null;
  workflowStatus: string | null;
  exceptionCode: string | null;
  lastNote: { text: string; at: string; author: string | null } | null;
  hasNote: boolean;
  owner: { id: number; name: string; dueAt: string | null } | null;
  /** The viewer holds an active assignment on the line. */
  mine: boolean;
  /** Paste positions (1-based) this line answers; empty in Query mode. */
  matchedRefs: number[];
}

/** Each event's instant and staffer over the unified line `l`. */
const EVENT_SQL: Readonly<Record<RecordsEvent, { at: string; by: string }>> = {
  picked: { at: 'l.picked_at', by: 'l.picked_by' },
  packed: { at: 'l.packed_at', by: 'l.packer_id' },
  scanned_out: { at: 'l.scanned_at', by: 'l.scanned_by' },
  unboxed: { at: 'l.unboxed_at', by: 'l.unboxed_by' },
  received: { at: 'l.received_at', by: 'l.received_by' },
  imported: { at: 'l.imported_at', by: 'l.imported_by' },
};

/** Each axis's instant over the unified line `l` (the cut the outer select re-applies for every axis). */
const AXIS_SQL: Readonly<Record<RecordsAxis, string>> = {
  placed: 'l.ordered_at',
  imported: 'l.imported_at',
  ship_by: 'l.ship_by_at',
  shipped: 'l.shipped_at',
  delivered: 'l.delivered_at',
};

/** Inbound Placed: the PO / order date (a civil day) as the start of that PT day. */
const INBOUND_PLACED_SQL = "COALESCE(io.order_date, mirror.po_date)::timestamp AT TIME ZONE 'America/Los_Angeles'";

/**
 * The axes outbound cuts BEFORE its joins (null = only after its packages
 * aggregate). Placed is `placedElseImportedSql` verbatim — the
 * `idx_orders_org_placed` expression. Inbound (a few thousand lines) is cut
 * once, after: its window expressions carry no statistics, and a guessed
 * handful of rows turns every side-table join into a nested loop (measured:
 * 3.8 s vs 0.7 s).
 */
const OUT_AXIS_SQL: Readonly<Record<RecordsAxis, string | null>> = {
  placed: placedElseImportedSql('o'),
  imported: 'o.created_at',
  ship_by: 'wa.deadline_at',
  shipped: null,
  delivered: null,
};

/** The window (`$4` inclusive, `$5` exclusive) over one instant; `true` when the side cannot cut on it yet. */
function windowCut(instant: string | null): string {
  if (!instant) return 'true';
  return `($4::timestamptz IS NULL OR ${instant} >= $4::timestamptz) AND ($5::timestamptz IS NULL OR ${instant} < $5::timestamptz)`;
}

/** A last note is one line on the sheet; the record holds the whole note. */
const NOTE_SNIPPET_CHARS = 160;

/**
 * One side's price chain over `base` (`record_id, order_key, unit_price, qty,
 * sale_amount, linked_total`): line total = unit × qty, else the sale amount
 * of a ONE-line order (a ShipStation row is the whole SS order); order total
 * = the linked ShipStation order total, else the sum of line totals when
 * every line has one.
 */
function priceCtes(name: string, base: string): string {
  return `${name}_line AS (
      ${base}
    ),
    ${name}_lined AS (
      SELECT p.*,
             count(*) OVER k AS order_lines,
             CASE WHEN p.unit_price IS NOT NULL AND p.qty IS NOT NULL THEN round(p.unit_price * p.qty, 2)
                  WHEN count(*) OVER k = 1 THEN p.sale_amount END AS line_total
        FROM ${name}_line p
      WINDOW k AS (PARTITION BY p.order_key)
    ),
    ${name} AS MATERIALIZED (
      SELECT p.record_id, p.order_key, p.qty, p.unit_price, p.order_lines, p.line_total,
             COALESCE(
               max(p.linked_total) OVER w,
               CASE WHEN count(p.line_total) OVER w = count(*) OVER w THEN sum(p.line_total) OVER w END
             ) AS order_total
        FROM ${name}_lined p
      WINDOW w AS (PARTITION BY p.order_key)
    )`;
}

/** `upper(alnum)` of a column — `canonicalizeTrackingKey`'s SQL face (the paste key). */
const canon = (expr: string) => `upper(regexp_replace(COALESCE(${expr}, ''), '[^A-Za-z0-9]', '', 'g'))`;

/** The event predicate: the chosen event (or, with none chosen, any event) happened, by `by`, in its window. */
function eventPredicate(event: RecordsEvent | null): string {
  const happened = (event ? [EVENT_SQL[event]] : Object.values(EVENT_SQL)).map(
    ({ at, by }) => `(${at} IS NOT NULL
        AND ($6::int IS NULL OR ${by} = $6::int)
        AND ($7::timestamptz IS NULL OR ${at} >= $7::timestamptz)
        AND ($8::timestamptz IS NULL OR ${at} < $8::timestamptz))`,
  );
  // No event chosen: no by / day window = no cut; else any event by that staffer in that window.
  const unset = event ? 'false' : '($6::int IS NULL AND $7::timestamptz IS NULL AND $8::timestamptz IS NULL)';
  return `(${unset}\n        OR ${happened.join('\n        OR ')})`;
}

/** Find parameters (`$9`–`$13`): text, LIKE pattern, tracking canonical / key18 / digits last-8. */
function findParams(q: string | null): unknown[] {
  const text = q?.trim() || null;
  if (!text) return [null, null, null, null, null];
  const keys = orderTrackingMatchKeys(text);
  return [text, `%${escapeLike(text)}%`, keys.exact, keys.key18, trackingDigitsLast8Strict(text)];
}

/** Paste parameters (`$14`–`$16`), index-aligned with the refs: canonical key, canonical tracking, tracking key-18. */
function refParams(refs: readonly string[]): unknown[] {
  const keys: string[] = [];
  const trackings: string[] = [];
  const key18s: string[] = [];
  for (const ref of refs) {
    const match = orderTrackingMatchKeys(ref);
    keys.push(canonicalizeTrackingKey(ref));
    trackings.push(match.exact);
    key18s.push(match.key18);
  }
  return [keys, trackings, key18s];
}

export function buildRecordsSql(orgId: OrgId, input: RecordsSqlInput): { sql: string; params: unknown[] } {
  const params: unknown[] = [
    orgId,
    input.outbound,
    input.inbound,
    input.fromAt,
    input.toBefore,
    input.eventBy,
    input.eventFromAt,
    input.eventToBefore,
    ...findParams(input.find),
    ...refParams(input.refs),
    input.viewerStaffId,
    input.orderIds ?? null,
  ];
  const trackingHit = sqlTrackingNumberMatches({
    stnAlias: 'stn',
    likeParam: '$10',
    canonicalParam: '$11',
    key18Param: "COALESCE($12, '')",
    last8Param: "COALESCE($13, '')",
  });
  const sql = `
    WITH r AS (
      SELECT * FROM unnest($14::text[], $15::text[], $16::text[]) WITH ORDINALITY AS r(canon, trk, key18, ord)
    ),
    ship_out AS MATERIALIZED (
      SELECT DISTINCT ON (so.shipment_id) so.shipment_id, so.created_at AS scanned_at, so.staff_id AS scanned_by
        FROM station_activity_logs so
       WHERE so.organization_id = $1
         AND so.activity_type = 'SHIP_CONFIRM'
         AND so.shipment_id IS NOT NULL
         AND so.staff_id > 0
       ORDER BY so.shipment_id, so.created_at DESC, so.id DESC
    ),
    -- Every package each line owns: 'o' = orders.id, 'i' = receiving_line.id. Inbound reads the line's
    -- own packages, else its carton's.
    in_line_pkg AS MATERIALIZED (
      SELECT rl.id AS owner_id, rl.shipment_id, true AS is_primary
        FROM receiving_line rl
       WHERE $3 AND rl.organization_id = $1 AND rl.shipment_id IS NOT NULL
      UNION ALL
      SELECT sl.owner_id, sl.shipment_id, sl.is_primary
        FROM shipment_links sl
       WHERE $3 AND sl.organization_id = $1 AND sl.owner_type = 'RECEIVING_LINE'
    ),
    in_carton_pkg AS MATERIALIZED (
      SELECT rc.id AS carton_id, rc.shipment_id, true AS is_primary
        FROM receiving_carton rc
       WHERE $3 AND rc.organization_id = $1 AND rc.shipment_id IS NOT NULL
      UNION ALL
      SELECT sl.owner_id, sl.shipment_id, sl.is_primary
        FROM shipment_links sl
       WHERE $3 AND sl.organization_id = $1 AND sl.owner_type = 'RECEIVING'
    ),
    pkg AS MATERIALIZED (
      SELECT DISTINCT ON (x.dir, x.owner_id, x.shipment_id) x.dir, x.owner_id, x.shipment_id, x.is_primary
        FROM (
          SELECT 'o'::text AS dir, o.id AS owner_id, o.shipment_id, true AS is_primary
            FROM orders o
           WHERE $2 AND o.organization_id = $1 AND o.shipment_id IS NOT NULL
             AND ($18::int[] IS NULL OR o.id = ANY ($18::int[]))
          UNION ALL
          SELECT 'o', sl.owner_id, sl.shipment_id, sl.is_primary
            FROM shipment_links sl
           WHERE $2 AND sl.organization_id = $1 AND sl.owner_type = 'ORDER'
             AND ($18::int[] IS NULL OR sl.owner_id = ANY ($18::int[]))
          UNION ALL
          SELECT 'i', lp.owner_id, lp.shipment_id, lp.is_primary FROM in_line_pkg lp
          UNION ALL
          SELECT 'i', rl.id, cp.shipment_id, cp.is_primary
            FROM receiving_line rl
            JOIN in_carton_pkg cp ON cp.carton_id = rl.receiving_id
           WHERE rl.organization_id = $1
             AND NOT EXISTS (SELECT 1 FROM in_line_pkg lp WHERE lp.owner_id = rl.id)
        ) x
       ORDER BY x.dir, x.owner_id, x.shipment_id, x.is_primary DESC
    ),
    -- Where each package's latest placed carrier event happened ("Anaheim, CA"), one pass.
    ev AS MATERIALIZED (
      SELECT e.shipment_id,
             substring(max(
               to_char(e.event_occurred_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS') || '|'
                 || CONCAT_WS(', ', INITCAP(NULLIF(BTRIM(e.event_city), '')), UPPER(NULLIF(BTRIM(e.event_state), '')))
             ) FROM 22) AS place
        FROM shipment_tracking_events e
       WHERE e.shipment_id IN (SELECT p.shipment_id FROM pkg p)
         AND e.event_occurred_at IS NOT NULL
         AND (NULLIF(BTRIM(e.event_city), '') IS NOT NULL OR NULLIF(BTRIM(e.event_state), '') IS NOT NULL)
       GROUP BY e.shipment_id
    ),
    pkg_agg AS MATERIALIZED (
      SELECT p.dir, p.owner_id,
             jsonb_agg(jsonb_build_object(
               'id', stn.id,
               't', stn.tracking_number_raw,
               'c', NULLIF(UPPER(BTRIM(stn.carrier)), ''),
               'k', UPPER(stn.latest_status_category),
               'l', COALESCE(NULLIF(BTRIM(stn.latest_status_label), ''), NULLIF(BTRIM(stn.latest_status_description), '')),
               'a', stn.latest_event_at,
               'e', stn.estimated_delivery_at,
               'd', CASE WHEN stn.is_delivered THEN stn.delivered_at END,
               'w', ev.place,
               'p', p.is_primary
             ) ORDER BY p.is_primary DESC, stn.id) AS packages,
             max(so.scanned_at) AS scanned_at,
             (array_agg(so.scanned_by ORDER BY so.scanned_at DESC) FILTER (WHERE so.scanned_at IS NOT NULL))[1] AS scanned_by,
             max(COALESCE(so.scanned_at, stn.carrier_accepted_at, stn.first_in_transit_at, stn.label_created_at)) AS shipped_at,
             max(stn.delivered_at) FILTER (WHERE stn.is_delivered) AS delivered_at,
             array_agg(stn.tracking_number_normalized) AS trk_keys,
             array_agg(right(stn.tracking_number_normalized, 18)) AS trk18,
             bool_or($9::text IS NOT NULL AND ${trackingHit}) AS find_hit
        FROM pkg p
        JOIN shipping_tracking_numbers stn ON stn.id = p.shipment_id AND stn.organization_id = $1
        LEFT JOIN ship_out so ON so.shipment_id = stn.id AND p.dir = 'o'
        LEFT JOIN ev ON ev.shipment_id = stn.id
       GROUP BY p.dir, p.owner_id
    ),
    wa_deadline AS MATERIALIZED (
      SELECT DISTINCT ON (wa.entity_id) wa.entity_id, wa.deadline_at
        FROM work_assignments wa
       WHERE $2 AND wa.organization_id = $1 AND wa.entity_type = 'ORDER' AND wa.work_type = 'TEST'
       ORDER BY wa.entity_id, ${WA_TEST_DEADLINE_RANK_ORDER_SQL('wa')}
    ),
    -- Who the line is assigned to: the latest active PICK / PACK assignment (the sheet's Assign,
    -- \`upsertOrderAssignment\`) or thrown task; and every line the viewer holds active work on.
    owner AS MATERIALIZED (
      SELECT DISTINCT ON (wa.entity_type, wa.entity_id)
             wa.entity_type::text AS entity_type, wa.entity_id, wa.assignee_staff_id, s.name AS assignee_name,
             COALESCE(wa.deadline_at, wa.next_follow_up_at) AS due_at
        FROM work_assignments wa
        JOIN staff s ON s.id = wa.assignee_staff_id AND s.organization_id = $1
       WHERE wa.organization_id = $1
         AND wa.entity_type IN ('ORDER', 'RECEIVING')
         AND wa.work_type IN ('PICK', 'PACK', 'FOLLOW_UP')
         AND wa.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
       ORDER BY wa.entity_type, wa.entity_id, wa.assigned_at DESC NULLS LAST, wa.id DESC
    ),
    mine AS MATERIALIZED (
      SELECT DISTINCT wa.entity_type::text AS entity_type, wa.entity_id
        FROM work_assignments wa
       WHERE $17::int IS NOT NULL
         AND wa.organization_id = $1
         AND wa.entity_type IN ('ORDER', 'RECEIVING')
         AND wa.assignee_staff_id = $17::int
         AND wa.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
    ),
    sor AS MATERIALIZED (
      SELECT DISTINCT ON (ref.order_row_id) ref.order_row_id, ref.customer_username, ref.order_total
        FROM shipstation_order_refs ref
       WHERE $2 AND ref.organization_id = $1 AND ref.order_row_id IS NOT NULL
       ORDER BY ref.order_row_id, ref.last_seen_at DESC NULLS LAST, ref.id DESC
    ),
    note_out AS MATERIALIZED (
      SELECT DISTINCT ON (n.order_id) n.order_id, n.note_text, n.created_at, s.name AS author
        FROM order_notes n
        LEFT JOIN staff s ON s.id = n.author_staff_id AND s.organization_id = $1
       WHERE $2 AND n.organization_id = $1
       ORDER BY n.order_id, n.created_at DESC, n.id DESC
    ),
    -- Prices over EVERY line of the org, so a window cut never shortens an order total. One chain per
    -- side (their order keys never collide), so each side's join reads exact row estimates.
    ${priceCtes(
      'price_out',
      `SELECT o.id AS record_id,
             CASE WHEN NULLIF(BTRIM(o.order_id), '') IS NOT NULL
                  THEN 'o:' || COALESCE(o.account_source, '') || '|' || BTRIM(o.order_id)
                  ELSE 'o:#' || o.id END AS order_key,
             o.unit_price,
             CASE WHEN o.quantity ~ '^\\s*[0-9]+(\\.[0-9]+)?\\s*$' THEN BTRIM(o.quantity)::numeric END AS qty,
             o.sale_amount,
             sor.order_total AS linked_total
        FROM orders o
        LEFT JOIN sor ON sor.order_row_id = o.id
       WHERE $2 AND o.organization_id = $1`,
    )},
    ${priceCtes(
      'price_in',
      `SELECT rl.id AS record_id,
             CASE WHEN rl.inbound_order_id IS NOT NULL THEN 'i:' || rl.inbound_order_id
                  WHEN rl.receiving_id IS NOT NULL THEN 'i:c' || rl.receiving_id
                  ELSE 'i:l' || rl.id END AS order_key,
             rl.unit_cost_cents / 100.0 AS unit_price,
             COALESCE(rl.quantity_expected, NULLIF(rl.quantity_received, 0))::numeric AS qty,
             NULL::numeric AS sale_amount,
             NULL::numeric AS linked_total
        FROM receiving_line rl
       WHERE $3 AND rl.organization_id = $1`,
    )},
    ol AS (
      SELECT 'outbound'::text AS direction,
             o.id AS record_id,
             NULLIF(BTRIM(o.order_id), '') AS order_number,
             pr.order_key,
             NULLIF(BTRIM(o.item_number), '') AS item_number,
             o.sku_catalog_id,
             COALESCE(sc.product_title, o.product_title) AS title,
             COALESCE(sc.sku, o.sku) AS sku,
             pr.qty,
             pr.unit_price,
             pr.line_total,
             pr.order_total,
             pr.order_lines,
             NULLIF(o.account_source, '') AS platform,
             ${accountSourceAccountLabelSql('o')} AS platform_account_label,
             COALESCE(NULLIF(BTRIM(cust.display_name), ''), NULLIF(BTRIM(cust.customer_name), ''), NULLIF(BTRIM(sor.customer_username), '')) AS customer,
             NULL::text AS vendor,
             NULL::text AS po,
             o.status AS channel_status,
             o.order_date AS placed_at,
             o.created_at AS imported_at,
             NULL::int AS imported_by,
             ${placedElseImportedSql('o')} AS ordered_at,
             to_char(wa.deadline_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD') AS ship_by_date,
             wa.deadline_at AS ship_by_at,
             pick_fact.picked_at,
             pick_fact.picked_by,
             pick_fact.picked_source,
             s_picked.name AS picked_by_name,
             COALESCE(osf.packed_at, osf.pack_activity_at) AS packed_at,
             COALESCE(osf.packed_by, osf.packer_id) AS packer_id,
             staff_packer.name AS packer_name,
             pa.scanned_at,
             pa.scanned_by,
             staff_scan.name AS scanned_by_name,
             pa.shipped_at,
             pa.delivered_at,
             NULL::timestamptz AS unboxed_at,
             NULL::int AS unboxed_by,
             NULL::text AS unboxed_by_name,
             NULL::timestamptz AS received_at,
             NULL::int AS received_by,
             NULL::text AS received_by_name,
             NULL::int AS units_received,
             NULL::int AS units_expected,
             false AS received_done,
             NULL::bigint AS inbound_order_id,
             NULL::int AS carton_id,
             NULLIF(BTRIM(o.service_level), '') AS service,
             pa.packages,
             LOWER(COALESCE(o.status, '')) = 'buyer_cancelled' AS buyer_cancelled,
             pa.scanned_at IS NOT NULL AS scanned_out,
             o.release_state,
             COALESCE(o.is_out_of_stock, false) AS out_of_stock,
             flag.order_id IS NOT NULL AS hold_flag,
             COALESCE(osf.has_pack_scan, false) AS packed,
             ${PICKED_BY_IS_PICKED_SQL} AS picked,
             NULL::text AS line_status,
             NULL::text AS workflow_status,
             NULL::text AS exception_code,
             nt.note_text AS note_text,
             nt.created_at AS note_at,
             nt.author AS note_author,
             ow.assignee_staff_id AS owner_id,
             ow.assignee_name AS owner_name,
             ow.due_at AS owner_due_at,
             mi.entity_id IS NOT NULL AS mine,
             ARRAY[${canon('o.order_id')}, ${canon('o.item_number')}] AS ref_keys,
             pa.trk_keys,
             pa.trk18,
             COALESCE(pa.find_hit, false) AS find_trk
        FROM orders o
        LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id AND sc.organization_id = o.organization_id
        LEFT JOIN customers cust ON cust.id = o.customer_id AND cust.organization_id = o.organization_id
        LEFT JOIN order_stage_facts osf ON osf.organization_id = o.organization_id AND osf.order_id = o.id
        LEFT JOIN staff staff_packer
          ON staff_packer.id = COALESCE(osf.packed_by, osf.packer_id) AND staff_packer.organization_id = o.organization_id
        LEFT JOIN pkg_agg pa ON pa.dir = 'o' AND pa.owner_id = o.id
        LEFT JOIN staff staff_scan ON staff_scan.id = pa.scanned_by AND staff_scan.organization_id = o.organization_id
        LEFT JOIN wa_deadline wa ON wa.entity_id = o.id
        LEFT JOIN sor ON sor.order_row_id = o.id
        LEFT JOIN note_out nt ON nt.order_id = o.id
        LEFT JOIN owner ow ON ow.entity_type = 'ORDER' AND ow.entity_id = o.id
        LEFT JOIN mine mi ON mi.entity_type = 'ORDER' AND mi.entity_id = o.id
        LEFT JOIN order_flags flag ON flag.organization_id = o.organization_id AND flag.order_id = o.id AND flag.flag = 'hold'
        ${PICKED_BY_LATERAL}
        JOIN price_out pr ON pr.record_id = o.id
       WHERE $2 AND o.organization_id = $1
         AND ($18::int[] IS NULL OR o.id = ANY ($18::int[]))
         AND ${windowCut(OUT_AXIS_SQL[input.axis])}
    ),
    il AS (
      SELECT 'inbound'::text AS direction,
             rl.id AS record_id,
             COALESCE(NULLIF(BTRIM(io.order_number), ''), po.po_number, mk.market_order) AS order_number,
             pr.order_key,
             NULLIF(BTRIM(rl.listing_reference), '') AS item_number,
             rl.sku_catalog_id,
             COALESCE(NULLIF(BTRIM(rl.item_name), ''), sc.product_title) AS title,
             COALESCE(sc.sku, rl.sku) AS sku,
             pr.qty,
             pr.unit_price,
             pr.line_total,
             pr.order_total,
             pr.order_lines,
             NULLIF(LOWER(BTRIM(COALESCE(io.source_type, rl.inbound_source_type, rc.source_platform::text, ''))), '') AS platform,
             NULL::text AS platform_account_label,
             NULL::text AS customer,
             COALESCE(NULLIF(BTRIM(mirror.vendor_name), ''), NULLIF(BTRIM(io.vendor_name), '')) AS vendor,
             po.po_number AS po,
             COALESCE(io.status, rl.workflow_status::text) AS channel_status,
             ${INBOUND_PLACED_SQL} AS placed_at,
             rl.created_at AS imported_at,
             io.created_by AS imported_by,
             COALESCE(${INBOUND_PLACED_SQL}, rl.created_at) AS ordered_at,
             NULL::text AS ship_by_date,
             NULL::timestamptz AS ship_by_at,
             NULL::timestamptz AS picked_at,
             NULL::int AS picked_by,
             NULL::text AS picked_source,
             NULL::text AS picked_by_name,
             NULL::timestamptz AS packed_at,
             NULL::int AS packer_id,
             NULL::text AS packer_name,
             NULL::timestamptz AS scanned_at,
             NULL::int AS scanned_by,
             NULL::text AS scanned_by_name,
             pa.shipped_at,
             pa.delivered_at,
             COALESCE(rl.unboxed_at, ru.unboxed_at) AS unboxed_at,
             COALESCE(ru.unboxed_by, ru.opened_by) AS unboxed_by,
             staff_unbox.name AS unboxed_by_name,
             COALESCE(rl.received_done_at, rl.received_at) AS received_at,
             rl.received_by,
             staff_recv.name AS received_by_name,
             rl.quantity_received AS units_received,
             rl.quantity_expected AS units_expected,
             rl.received_done_at IS NOT NULL AS received_done,
             rl.inbound_order_id,
             rl.receiving_id AS carton_id,
             NULL::text AS service,
             pa.packages,
             false AS buyer_cancelled,
             false AS scanned_out,
             NULL::text AS release_state,
             false AS out_of_stock,
             false AS hold_flag,
             false AS packed,
             false AS picked,
             rl.receiving_line_status::text AS line_status,
             rl.workflow_status::text AS workflow_status,
             COALESCE(NULLIF(BTRIM(rl.exception_code::text), ''), NULLIF(BTRIM(rc.exception_code::text), '')) AS exception_code,
             NULLIF(BTRIM(rl.notes), '') AS note_text,
             CASE WHEN NULLIF(BTRIM(rl.notes), '') IS NOT NULL THEN rl.updated_at END AS note_at,
             NULL::text AS note_author,
             ow.assignee_staff_id AS owner_id,
             ow.assignee_name AS owner_name,
             ow.due_at AS owner_due_at,
             mi.entity_id IS NOT NULL AS mine,
             ARRAY[${canon('po.po_number')}, ${canon('mirror.reference_number')}, ${canon('io.external_order_id')},
                   ${canon('io.order_number')}, ${canon('rl.source_order_id')}, ${canon('rc.source_order_id')},
                   ${canon('rc.zoho_purchaseorder_number')}] AS ref_keys,
             pa.trk_keys,
             pa.trk18,
             COALESCE(pa.find_hit, false) AS find_trk
        FROM receiving_line rl
        LEFT JOIN receiving_carton rc ON rc.id = rl.receiving_id AND rc.organization_id = rl.organization_id
        LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
        LEFT JOIN zoho_po_mirror mirror
          ON mirror.zoho_purchaseorder_id = COALESCE(rz.zoho_purchaseorder_id, rc.zoho_purchaseorder_id)
         AND mirror.organization_id = rl.organization_id
        LEFT JOIN inbound_order io ON io.id = rl.inbound_order_id AND io.organization_id = rl.organization_id
        LEFT JOIN sku_catalog sc ON sc.id = rl.sku_catalog_id AND sc.organization_id = rl.organization_id
        LEFT JOIN receiving_unbox ru ON ru.receiving_id = rl.receiving_id AND ru.organization_id = rl.organization_id
        LEFT JOIN staff staff_unbox
          ON staff_unbox.id = COALESCE(ru.unboxed_by, ru.opened_by) AND staff_unbox.organization_id = rl.organization_id
        LEFT JOIN staff staff_recv ON staff_recv.id = rl.received_by AND staff_recv.organization_id = rl.organization_id
        LEFT JOIN pkg_agg pa ON pa.dir = 'i' AND pa.owner_id = rl.id
        LEFT JOIN owner ow ON ow.entity_type = 'RECEIVING' AND ow.entity_id = rl.id
        LEFT JOIN mine mi ON mi.entity_type = 'RECEIVING' AND mi.entity_id = rl.id
        CROSS JOIN LATERAL (
          SELECT COALESCE(NULLIF(BTRIM(rz.zoho_purchaseorder_number), ''), NULLIF(BTRIM(mirror.zoho_purchaseorder_number), ''),
                          NULLIF(BTRIM(rc.zoho_purchaseorder_number), ''),
                          CASE WHEN io.source_type = 'zoho' THEN NULLIF(BTRIM(io.order_number), '') END) AS po_number
        ) po
        CROSS JOIN LATERAL (
          SELECT COALESCE(CASE WHEN io.source_type <> 'zoho' THEN NULLIF(BTRIM(io.external_order_id), '') END,
                          NULLIF(BTRIM(rl.source_order_id), ''), NULLIF(BTRIM(rc.source_order_id), '')) AS market_order
        ) mk
        JOIN price_in pr ON pr.record_id = rl.id
       WHERE $3 AND rl.organization_id = $1
    ),
    lines AS (
      SELECT * FROM ol
      UNION ALL
      SELECT * FROM il
    )
    -- Only what the service reads: the wire to the app is the read's main cost (thousands of lines).
    SELECT l.direction, l.record_id, l.order_number, l.order_key, l.item_number, l.sku_catalog_id, l.title, l.sku,
           l.qty, l.unit_price, l.line_total, l.order_total, l.order_lines, l.platform, l.platform_account_label,
           l.customer, l.vendor, l.po, l.channel_status, l.placed_at, l.imported_at, l.ordered_at,
           l.ship_by_date, l.ship_by_at, l.picked_at, l.picked_by, l.picked_source, l.picked_by_name,
           l.packed_at, l.packer_id, l.packer_name, l.scanned_at, l.scanned_by, l.scanned_by_name, l.shipped_at,
           l.unboxed_at, l.unboxed_by, l.unboxed_by_name, l.received_at, l.received_by, l.received_by_name,
           l.units_received, l.units_expected, l.received_done, l.inbound_order_id, l.carton_id, l.service, l.packages,
           l.buyer_cancelled, l.scanned_out, l.release_state, l.out_of_stock, l.hold_flag, l.packed, l.picked,
           l.line_status, l.workflow_status, l.exception_code,
           left(l.note_text, ${NOTE_SNIPPET_CHARS}) AS note_text, l.note_at, l.note_author,
           l.owner_id, l.owner_name, l.owner_due_at, l.mine,
           m.matched_refs
      FROM lines l
      CROSS JOIN LATERAL (
        SELECT CASE WHEN cardinality($14::text[]) = 0 THEN '{}'::int[] ELSE ARRAY(
                 SELECT r.ord::int FROM r
                  WHERE (r.canon <> '' AND r.canon = ANY (l.ref_keys))
                     OR (r.trk <> '' AND r.trk = ANY (l.trk_keys))
                     OR (r.key18 <> '' AND r.key18 = ANY (l.trk18))
                  ORDER BY r.ord) END AS matched_refs
      ) m
     WHERE ${windowCut(AXIS_SQL[input.axis])}
       AND (cardinality($14::text[]) = 0 OR cardinality(m.matched_refs) > 0)
       AND ${eventPredicate(input.event)}
       AND ($9::text IS NULL
            OR ${sqlIdentifierEqualsQuery('l.order_number', '$9')}
            OR l.order_number ILIKE $10
            OR l.po ILIKE $10
            OR l.sku ILIKE $10
            OR l.title ILIKE $10
            OR l.customer ILIKE $10
            OR l.vendor ILIKE $10
            OR l.find_trk)`;
  return { sql, params };
}

/** A wire stamp: node-pg hands timestamptz back as `Date`. To the second. */
function stamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const text = value == null ? '' : String(value).trim();
  if (!text) return null;
  const at = Date.parse(text);
  return Number.isNaN(at) ? text : new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const text = (value: unknown): string | null => (value == null ? null : String(value).trim() || null);

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function staffOf(id: unknown, name: unknown): { id: number | null; name: string | null } | null {
  const staffId = positiveId(id);
  const staffName = text(name);
  return staffId === null && staffName === null ? null : { id: staffId, name: staffName };
}

export function recordLineRowOf(row: Record<string, unknown>): RecordLineRow {
  const ownerId = positiveId(row.owner_id);
  // A note's mention tokens read as `@Name`, on one line — the snippet the sheet paints.
  const noteText = text(row.note_text) ? noteMentionsToPlain(String(row.note_text)).replace(/\s+/g, ' ').trim() || null : null;
  const noteAt = stamp(row.note_at);
  return {
    direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
    recordId: Number(row.record_id),
    orderNumber: text(row.order_number),
    orderKey: String(row.order_key),
    itemNumber: text(row.item_number),
    skuCatalogId: positiveId(row.sku_catalog_id),
    title: text(row.title),
    sku: text(row.sku),
    qty: num(row.qty),
    unitPrice: num(row.unit_price),
    lineTotal: num(row.line_total),
    orderTotal: num(row.order_total),
    orderLines: num(row.order_lines) ?? 1,
    platform: text(row.platform),
    platformAccountLabel: text(row.platform_account_label),
    customer: text(row.customer),
    vendor: text(row.vendor),
    po: text(row.po),
    channelStatus: text(row.channel_status),
    placedAt: stamp(row.placed_at),
    importedAt: stamp(row.imported_at),
    orderedAt: stamp(row.ordered_at),
    shipByDate: text(row.ship_by_date),
    shipByAt: stamp(row.ship_by_at),
    pickedAt: stamp(row.picked_at),
    pickedBy: pickedByFromRow(row),
    packedAt: stamp(row.packed_at),
    packer: staffOf(row.packer_id, row.packer_name),
    scannedAt: stamp(row.scanned_at),
    scannedBy: staffOf(row.scanned_by, row.scanned_by_name),
    shippedAt: stamp(row.shipped_at),
    unboxedAt: stamp(row.unboxed_at),
    // A carton only OPENED (no unbox stamp) has no "Unboxed by": the cell would name someone for a step the status says never happened.
    unboxedBy: row.unboxed_at ? staffOf(row.unboxed_by, row.unboxed_by_name) : null,
    receivedAt: stamp(row.received_at),
    receivedBy: staffOf(row.received_by, row.received_by_name),
    unitsReceived: num(row.units_received),
    unitsExpected: num(row.units_expected),
    receivedDone: row.received_done === true,
    inboundOrderId: positiveId(row.inbound_order_id),
    cartonId: positiveId(row.carton_id),
    service: text(row.service),
    packages: Array.isArray(row.packages)
      ? (row.packages as Record<string, unknown>[]).map((raw) => ({
          shipmentId: Number(raw.id),
          tracking: text(raw.t),
          carrier: text(raw.c),
          category: text(raw.k),
          statusLabel: text(raw.l),
          latestEventAt: stamp(raw.a),
          eta: stamp(raw.e),
          deliveredAt: stamp(raw.d),
          place: text(raw.w),
          primary: raw.p === true,
        }))
      : [],
    buyerCancelled: row.buyer_cancelled === true,
    scannedOut: row.scanned_out === true,
    releaseState: text(row.release_state),
    outOfStock: row.out_of_stock === true,
    holdFlag: row.hold_flag === true,
    packed: row.packed === true,
    picked: row.picked === true,
    lineStatus: text(row.line_status),
    workflowStatus: text(row.workflow_status),
    exceptionCode: text(row.exception_code),
    lastNote: noteText && noteAt ? { text: noteText, at: noteAt, author: text(row.note_author) } : null,
    hasNote: noteText !== null,
    owner: ownerId !== null ? { id: ownerId, name: text(row.owner_name) ?? `#${ownerId}`, dueAt: stamp(row.owner_due_at) } : null,
    mine: row.mine === true,
    matchedRefs: Array.isArray(row.matched_refs) ? row.matched_refs.map(Number) : [],
  };
}
