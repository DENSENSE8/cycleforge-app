/**
 * SQL builders for GET /api/receiving-lines (and its testing twin).
 *
 * Extracted VERBATIM from the route handler (roi-execution/03 #8). Every SQL
 * string, correlated-subquery fragment, param ordering, and view branch is
 * pinned by build-sql.test.ts against a transcription of the legacy code.
 * Pure + sync: async inputs (feature flags, viewer identity) are resolved by
 * the route and passed in.
 *
 * Wave-2 street cutover (receiving spine refactor): every READ of a moved
 * column goes through the 1:1 street tables — receiving_triage rt /
 * receiving_unbox ru (carton grain) and receiving_line_testing rlt /
 * receiving_line_zoho rz (line grain) — while writers still stamp the spine
 * and DB triggers mirror at verified 0-drift parity. Output aliases are
 * byte-identical to the spine era, so normalizeRow and clients are untouched.
 * The fixture was regenerated with the same mechanical edits in the same PR.
 *
 * DELIBERATE BEHAVIOR CHANGE (2026-08-02) — `pairing_state` is selected RAW,
 * not `COALESCE(rt.pairing_state, 'UNFOUND')`. A carton with no receiving_triage
 * row has no recorded pairing answer, and the default invented one; absent and
 * recorded are different answers and only the reader can decide what absence
 * means. No consumer changes behaviour (`isTriagePaired` tests for WAIVED /
 * MATCHED, and `ArrivalCartonPipeline` renders the chip only when the value is
 * present and not UNFOUND — null and 'UNFOUND' were already equivalent to
 * both). The fixture carries the identical edit, so the parity guard stays
 * byte-exact.
 *
 * DELIBERATE BEHAVIOR CHANGE (2026-08-03) — line `image_url` prefers Zoho
 * `items.image_document_id` → `/api/zoho/items/{id}/image` (then
 * `items.image_url`) over bare `sc.image_url`, matching get-title-by-sku /
 * sku-catalog search. Catalog thumbs are only used when no Zoho item row
 * exists (wrong-SKU collision risk). Fragment: ./sql-receiving-image.
 */
import {
  NOT_ZOHO_RECEIVED_PREDICATE,
  CARRIER_MISMATCH_PREDICATE,
  SHIPMENT_SCANNED_PREDICATE,
} from '@/lib/receiving/delivered-unscanned';
import {
  DELIVERED_UNSCANNED_WINDOW_DAYS,
  INCOMING_REMOVED_WINDOW_DAYS,
} from '@/lib/receiving/incoming-removal-reason';
import {
  INBOUND_MARKETPLACE_CARTON_SOURCES_SQL,
  INBOUND_MARKETPLACE_LINE_SOURCES_SQL,
  notLineInboundMirrorTerminalPredicate,
} from '@/lib/inbound/mirror';
import { sqlReceivingPhotoCount } from '@/lib/photos/queries/receiving-list';
import { unboxOpenedPredicateSql } from '@/lib/receiving/unbox-scan-opened-sql';
import { priorityRankSql, laneRankSql } from '@/lib/receiving/display/precedence';
import { receivingHistorySkipsUnmatchedPlaceholders } from '@/lib/receiving-history-search';
import {
  sqlCartonLinkedSupportTicketLateralJoin,
  sqlLinkedSupportTicketLateralJoin,
  sqlReceivingCartonZendeskTicketColumn,
  sqlReceivingZendeskTicketColumn,
} from './sql-receiving-ticket';
import { RECEIVING_LINE_IMAGE_URL_SQL } from './sql-receiving-image';
import { SKU_CATALOG_JOIN_ON_SQL } from '@/lib/sku/sku-identity-law';
import {
  QA_STATUSES,
  DISPOSITIONS,
  WORKFLOW_STATUSES,
  type ReceivingLinesQuery,
} from './query';

/**
 * Shelf label for Unbox Queue / list feeds — same expression as GET
 * `/api/receiving/[id]` (`room · name` or bare `name`). Requires
 * {@link STAGING_LOCATION_JOIN_SQL}.
 */
const STAGING_LOCATION_LABEL_SQL = `CASE
                  WHEN loc.id IS NULL THEN NULL
                  WHEN loc.room IS NOT NULL AND BTRIM(loc.room) <> ''
                    THEN loc.room || ' · ' || loc.name
                  ELSE loc.name
                END AS staging_location_label`;

/** Join warehouse map onto triage shelf FK. */
const STAGING_LOCATION_JOIN_SQL =
  'LEFT JOIN locations loc ON loc.id = rt.staging_location_id';

/**
 * Unbox commit `stage` — intended putaway bin on receiving_line_putaway.
 * Alias `stg_loc` so it never collides with Arrival `loc` (door shelf).
 */
const PUTAWAY_STAGED_SELECT_SQL = `rlp.staged_at::text AS staged_at,
                rlp.staged_location_id AS staged_location_id,
                stg_loc.name AS staged_location_name,
                stg_loc.barcode AS staged_location_barcode,
                stg_loc.room AS staged_location_room,
                stg_loc.row_label AS staged_location_row_label,
                stg_loc.col_label AS staged_location_col_label,
                rlp.location_code AS staged_location_code,
                rlp.staged_by AS staged_by,
                staff_stg.name AS staged_by_name`;

const PUTAWAY_STAGED_JOIN_SQL = `LEFT JOIN receiving_line_putaway rlp
           ON rlp.receiving_line_id = rl.id AND rlp.organization_id = rl.organization_id
         LEFT JOIN locations stg_loc ON stg_loc.id = rlp.staged_location_id
         LEFT JOIN staff staff_stg ON staff_stg.id = rlp.staged_by`;

/** Arrival staged = shelf + lane (mirrors `isArrivalStaged`). */
const STAGING_STAGED_PREDICATE_SQL =
  `(rt.staging_location_id IS NOT NULL AND NULLIF(BTRIM(COALESCE(rt.priority_lane, '')), '') IS NOT NULL)`;

const STAGING_UNSTAGED_PREDICATE_SQL =
  `(rt.staging_location_id IS NULL OR NULLIF(BTRIM(COALESCE(rt.priority_lane, '')), '') IS NULL)`;

/** One executable statement: SQL text + positional params. */
export interface BuiltSql {
  sql: string;
  params: unknown[];
}

/** A paged feed: the row query + its sibling COUNT query. */
export interface BuiltListSql {
  list: BuiltSql;
  count: BuiltSql;
}

/**
 * A serial (aliased `alias`) whose CURRENT receiving line — its most recent
 * inventory_events touch, falling back to the frozen origin — is `rl.id`.
 * NOT a plain `alias.origin_receiving_line_id = rl.id` join: that column
 * COALESCE-freezes to the FIRST-ever line, so a returned-then-re-received
 * serial would only ever "find" the PO it originally shipped under, never the
 * one it's actually on now. Mirrors `resolveCurrentReceivingLineIds`
 * (src/lib/neon/serial-units-queries.ts) — same logic, inlined because it
 * composes into a larger dynamic WHERE string rather than running standalone.
 */
export function currentLineIsMatchSql(alias: string): string {
  // Phase 3: the frozen-origin fallback is the RECEIVING_LINE provenance edge
  // (correlated subquery, since this composes into a dynamic WHERE string).
  return `COALESCE(
    (SELECT ie.receiving_line_id FROM inventory_events ie
      WHERE ie.serial_unit_id = ${alias}.id AND ie.receiving_line_id IS NOT NULL
        AND ie.organization_id = ${alias}.organization_id
      ORDER BY ie.occurred_at DESC, ie.id DESC LIMIT 1),
    (SELECT p.origin_id FROM serial_unit_provenance p
      WHERE p.serial_unit_id = ${alias}.id AND p.origin_type = 'RECEIVING_LINE'
        AND p.origin_id IS NOT NULL AND p.organization_id = ${alias}.organization_id
      ORDER BY p.occurred_at ASC, p.id ASC LIMIT 1)
  ) = rl.id`;
}

// Priority rank for the receiving "Prioritize" views (?sort=priority). Lower
// rank sorts to the top. An explicitly-flagged carton (receiving_carton.is_priority —
// pending-order match or manual toggle) is rank 0 and leads everything. Next, an
// unfound/untagged carton is the most urgent thing to triage (you can't act
// until it's identified); once a platform is tagged the order is amazon → ebay →
// goodwill; everything else trails. The platform half is derived at read time
// from receiving_carton.source_platform, so re-tagging a carton immediately
// re-prioritizes it. References the `r` alias (the LATERAL receiving_carton join in
// every list query below).
// A manual priority_tier override (0..3) wins outright via COALESCE; falls back
// to the legacy is_priority boolean (rank 0), then the platform-derived rank.
// Derived from the rules-as-data SoT (src/lib/receiving/display/precedence.ts)
// so the server sort and the client badge (receivingPriorityRank) can never
// drift — semantically identical to the former hand-written CASE (§7 Step E).
const RECEIVING_PRIORITY_RANK_SQL = priorityRankSql({
  tier: 'r.priority_tier',
  isPriority: 'r.is_priority',
  source: 'r.source',
  sourcePlatform: 'r.source_platform',
});

// Triage priority-lane tier (docs/receiving-triage-redesign-plan.md §4.2) —
// composes with RECEIVING_PRIORITY_RANK_SQL as a SECONDARY tie-breaker, never
// a replacement: `priority_lane` is NULL on every carton that predates Phase 2
// (and on any carton the operator hasn't staged yet), so putting it ahead of
// the primary rank would silently reshuffle the entire live Prioritize tab the
// moment this shipped. Mirrors receivingTriageLanePolicy's lane values
// (src/lib/receiving/triage-lane-policy.ts) — keep in sync if that list changes.
const RECEIVING_LANE_RANK_SQL = laneRankSql('rt.priority_lane');

/**
 * The exits a row can take off the Incoming list, as SQL — one fragment per
 * reason in the removal-reason registry, all inside the recency window.
 *
 * **Derived, never stored.** There is no `removed_at` column and no lane table:
 * each arm is the *inverse* of a condition `view=incoming` uses to exclude the
 * row, so the two can never disagree about who left. A stored flag would need a
 * writer on every one of these paths and would be wrong the first time one was
 * missed.
 *
 * Every alias here (`ru` · `rt` · `stn` · `mirror` · `rl`) is joined by BOTH the
 * list query and its sibling COUNT — the LATERALs the list adds (`scan_first`,
 * `ops_scan`, …) are not, so the dock-scan arm is an EXISTS rather than a join.
 *
 * ⚠ `mirror.last_synced_at` is when WE POLLED, not when the vendor flipped the
 * status. It is used because it is the only timestamp that exists, and the face
 * says so ("seen received at last sync"). Do not relabel it as a transition
 * time; closing that gap needs `zoho_po_mirror.status_changed_at`.
 */
function incomingRemovedExitsSql(windowDays: number, huntWindowDays: number): string {
  const within = `NOW() - interval '${windowDays} days'`;
  return `(
           -- 1 · unboxed / received here (physical, and it outranks the rest)
           ru.unboxed_at > ${within}
           OR (COALESCE(rl.quantity_received, 0) > 0 AND rl.updated_at > ${within})
           -- 5 · written off — an OPEN loss exception stands against the carton
           OR EXISTS (
                SELECT 1 FROM receiving_exceptions rx
                 WHERE rx.organization_id = rl.organization_id
                   AND rx.receiving_line_id = rl.id
                   AND rx.status = 'OPEN'
                   AND rx.exception_code IN ('LOST_IN_TRANSIT','EMPTY_BOX','MISDELIVERED','STOLEN')
                   AND rx.created_at > ${within}
              )
           -- 3 · dock-scanned (left for the unbox queue)
           OR rt.door_received_at > ${within}
           OR EXISTS (
                SELECT 1 FROM receiving_scans rs_removed
                 WHERE rs_removed.receiving_id = r.id
                   AND rs_removed.organization_id = rl.organization_id
                   AND rs_removed.scanned_at > ${within}
              )
           -- 2 · vendor marked it received (the exit with no transition stamp)
           OR (NOT ${NOT_ZOHO_RECEIVED_PREDICATE} AND mirror.last_synced_at > ${within})
           -- 4 · aged off the delivered-and-unscanned hunt queue: delivered, never
           --     scanned, and now past that window — nobody removed it, time did.
           OR (
                COALESCE(stn.is_delivered, false) = true
                AND NOT ${SHIPMENT_SCANNED_PREDICATE}
                AND stn.delivered_at < NOW() - interval '${huntWindowDays} days'
                AND stn.delivered_at > NOW() - interval '${huntWindowDays + windowDays} days'
              )
         )`;
}

/** `?id=<n>` — single row, full detail joins. Params: `[id, orgId]`. */
export function buildReceivingLineByIdSql(id: number, orgId: string): BuiltSql {
  return {
    sql:
      `SELECT rl.*,
                -- Wave-2 street cutover: moved line-cluster columns are read
                -- from their 1:1 street tables (receiving_line_testing rlt /
                -- receiving_line_zoho rz); the duplicate output names override
                -- the rl.* spine values (last column wins in pg row objects).
                COALESCE(rlt.needs_test, false)              AS needs_test,
                rlt.assigned_tech_id                         AS assigned_tech_id,
                rlt.qa_status                                AS qa_status,
                rlt.disposition_code                         AS disposition_code,
                rlt.condition_grade                          AS condition_grade,
                rlt.disposition_final                        AS disposition_final,
                COALESCE(rlt.disposition_audit, '[]'::jsonb) AS disposition_audit,
                rlt.condition_set_at                         AS condition_set_at,
                rlt.condition_graded_at::text                         AS condition_graded_at,
                ru.contents_confirmed_at::text                         AS contents_confirmed_at,
                rlt.label_printed_at                         AS label_printed_at,
                rlt.label_previewed_at::text                       AS label_previewed_at,
                ${PUTAWAY_STAGED_SELECT_SQL},
                COALESCE(rlt.serial_absent, false)           AS serial_absent,
                rlt.serial_absent_reason                     AS serial_absent_reason,
                COALESCE(rlt.serial_projection, '[]'::jsonb)   AS serials,
                rz.zoho_item_id                              AS zoho_item_id,
                rz.zoho_line_item_id                         AS zoho_line_item_id,
                rz.zoho_purchase_receive_id                  AS zoho_purchase_receive_id,
                rz.zoho_purchaseorder_id                     AS zoho_purchaseorder_id,
                rz.zoho_purchaseorder_number                 AS zoho_purchaseorder_number,
                rz.zoho_purchaseorder_number_norm            AS zoho_purchaseorder_number_norm,
                rz.zoho_sync_source                          AS zoho_sync_source,
                rz.zoho_last_modified_time                   AS zoho_last_modified_time,
                rz.zoho_synced_at                            AS zoho_synced_at,
                rz.zoho_notes                                AS zoho_notes,
                rz.unit_price                                AS unit_price,
                -- Mirror receipt status — REQUIRED on ?id=. Inventory Refresh
                -- re-fetches through this builder then dispatchLine; without
                -- these columns the client zoho_status is null forever and
                -- coarse paint stays UNBOXED while Information shows RECEIVED.
                mirror.status                                AS zoho_status,
                mirror.last_synced_at::text                  AS zoho_status_synced_at,
                stn.tracking_number_raw AS receiving_tracking_number,
                r.carrier,
                r.source                     AS receiving_source,
                r.source_platform            AS receiving_source_platform,
                r.intake_type                AS receiving_intake_type,
                COALESCE(r.is_priority, false) AS is_priority,
                r.priority_tier                AS priority_tier,
                COALESCE(rt.triage_complete, false) AS triage_complete,
                rt.triage_completed_at::text    AS triage_completed_at,
                COALESCE(ru.intake_path = 'unbox_only', false) AS unbox_only_intake,
                rt.staging_location_id,
                ${STAGING_LOCATION_LABEL_SQL},
                rt.priority_lane,
                rt.pairing_state,
                r.zoho_purchaseorder_number  AS receiving_zoho_purchaseorder_number,
                r.support_notes              AS receiving_support_notes,
                r.zoho_notes                 AS receiving_zoho_notes,
                r.listing_url                AS receiving_listing_url,
                rt.door_received_at::text          AS receiving_received_at,
                ru.unboxed_at::text           AS receiving_unboxed_at,
                rt.door_received_by                AS receiving_received_by,
                ru.unboxed_by                 AS receiving_unboxed_by,
                staff_rb.name                AS received_by_name,
                staff_ub.name                AS unboxed_by_name,
                COALESCE(ops_scan.first_scanned_at, scan_first.scanned_at)::text  AS first_scanned_at,
                scan_first.scanned_by        AS first_scanned_by,
                staff_sb.name                AS scanned_by_name,
                -- Last physical scan against this carton. Must match the list
                -- view (view=activity) so the single-line refresh dispatched on
                -- every line-select doesn't clobber the rail's scan-based
                -- "last touched" time with rl.created_at (the import date).
                COALESCE(ops_scan.last_scanned_at, rs_agg.last_scan)::text       AS last_scan_at,
                stn.tracking_number_raw      AS shipment_tracking_number,
                stn.carrier                  AS shipment_carrier,
                stn.latest_status_category   AS shipment_status_category,
                stn.is_delivered             AS shipment_is_delivered,
                stn.delivered_at             AS shipment_delivered_at,
                ${RECEIVING_LINE_IMAGE_URL_SQL},
                sc.product_title             AS catalog_product_title,
                -- Zoho item title (canonical SoT). Always preferred for display
                -- over the PO line's listing-style item_name and over the
                -- marketplace catalog title — the Zoho SKU's own title governs.
                (SELECT name FROM items
                  WHERE zoho_item_id = rz.zoho_item_id AND status = 'active'
                  LIMIT 1)                   AS zoho_item_title,
                sc.id                        AS sku_catalog_id,
                ${sqlReceivingPhotoCount('rl.receiving_id', 'rl.organization_id')} AS photo_count,
                -- ticket_links (authoritative) → denormalized columns fallback.
                ${sqlReceivingZendeskTicketColumn()}
         FROM receiving_line rl
         LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
         LEFT JOIN receiving_line_zoho rz     ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         ${PUTAWAY_STAGED_JOIN_SQL}
         LEFT JOIN zoho_po_mirror mirror
           ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
          AND mirror.organization_id = rl.organization_id
         -- Soft JOIN: direct FK when set, else PO#-based fallback. Partial
         -- unique index ux_receiving_zoho_po_matched (source='zoho_po') ensures
         -- at most one PO-matched receiving row per PO, so no dedup needed.
         -- D1 wrong-shipment guard: a direct receiving FK, else a PO#-based
         -- fallback. When a line has no FK and its PO has multiple zoho_po
         -- receiving rows, the old ON-clause matched them all (row
         -- multiplication / arbitrary shipment). LATERAL + LIMIT 1 picks exactly
         -- one, deterministically: direct FK wins, else prefer a row that
         -- actually carries a shipment, else the newest.
         LEFT JOIN LATERAL (
           SELECT r.* FROM receiving_carton r
            WHERE r.organization_id = rl.organization_id
              AND (r.id = rl.receiving_id
               OR (rl.receiving_id IS NULL
                   AND r.source = 'zoho_po'
                   AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id)
               OR (rl.receiving_id IS NULL
                   AND ${INBOUND_MARKETPLACE_CARTON_SOURCES_SQL}
                   AND r.source_order_id = rl.source_order_id
                   AND r.organization_id = rl.organization_id))
            ORDER BY (r.id = rl.receiving_id) DESC,
                     (r.shipment_id IS NOT NULL) DESC,
                     r.id DESC
            LIMIT 1
         ) r ON TRUE
         ${sqlLinkedSupportTicketLateralJoin()}
         LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
         ${STAGING_LOCATION_JOIN_SQL}
         LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
         LEFT JOIN LATERAL (
            SELECT MAX(rs.scanned_at) AS last_scan
            FROM receiving_scans rs
            WHERE rs.receiving_id = r.id
         ) rs_agg ON TRUE
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
         LEFT JOIN staff staff_rb                ON staff_rb.id = rt.door_received_by
         LEFT JOIN staff staff_ub                ON staff_ub.id = ru.unboxed_by
         LEFT JOIN LATERAL (
           SELECT rs.scanned_at, rs.scanned_by
           FROM receiving_scans rs
           WHERE rs.receiving_id = r.id
           ORDER BY rs.scanned_at ASC NULLS LAST, rs.id ASC
           LIMIT 1
         ) scan_first ON TRUE
         LEFT JOIN LATERAL (
           SELECT
             MIN(oe.occurred_at) AS first_scanned_at,
             MAX(oe.occurred_at) AS last_scanned_at
           FROM ops_events oe
           WHERE oe.organization_id = rl.organization_id
             AND oe.entity_type = 'receiving'
             AND oe.entity_id = r.id
             AND oe.event_type = 'TRACKING_SCANNED'
         ) ops_scan ON TRUE
         LEFT JOIN staff staff_sb                ON staff_sb.id = scan_first.scanned_by
         -- sku_catalog join is on the SKU STRING, which collides across tenants;
         -- pin to the line's org so a same-SKU row in another tenant can't leak.
         -- THE SKU IDENTITY LAW (src/lib/sku/sku-identity-law.ts): exact +
         -- org-scoped, nothing else. The old title-similarity predicate here was
         -- a contamination detector, not a key fix — measured 0/2862 lines where
         -- this join disagreed with rz.zoho_item_id. Migration 2026-09-15g
         -- removed the contamination (132 Ecwid-overwritten titles) it hid.
         LEFT JOIN sku_catalog sc                ON ${SKU_CATALOG_JOIN_ON_SQL}
         WHERE rl.id = $1 AND rl.organization_id = $2`,
    params: [id, orgId],
  };
}

/**
 * `?receiving_id=<n>` — all lines for one package + the package stamp row.
 * Both statements bind `[receivingId, orgId]`.
 */
export function buildReceivingLinesByReceivingIdSql(
  receivingId: number,
  orgId: string,
): { lines: BuiltSql; pkg: BuiltSql } {
  const params = [receivingId, orgId];
  return {
    lines: {
      sql:
        `SELECT rl.*,
                -- Wave-2 street cutover: moved line-cluster columns are read
                -- from their 1:1 street tables (receiving_line_testing rlt /
                -- receiving_line_zoho rz); the duplicate output names override
                -- the rl.* spine values (last column wins in pg row objects).
                COALESCE(rlt.needs_test, false)              AS needs_test,
                rlt.assigned_tech_id                         AS assigned_tech_id,
                rlt.qa_status                                AS qa_status,
                rlt.disposition_code                         AS disposition_code,
                rlt.condition_grade                          AS condition_grade,
                rlt.disposition_final                        AS disposition_final,
                COALESCE(rlt.disposition_audit, '[]'::jsonb) AS disposition_audit,
                rlt.condition_set_at                         AS condition_set_at,
                rlt.condition_graded_at::text                         AS condition_graded_at,
                ru.contents_confirmed_at::text                         AS contents_confirmed_at,
                rlt.label_printed_at                         AS label_printed_at,
                rlt.label_previewed_at::text                       AS label_previewed_at,
                ${PUTAWAY_STAGED_SELECT_SQL},
                COALESCE(rlt.serial_absent, false)           AS serial_absent,
                rlt.serial_absent_reason                     AS serial_absent_reason,
                COALESCE(rlt.serial_projection, '[]'::jsonb)   AS serials,
                rz.zoho_item_id                              AS zoho_item_id,
                rz.zoho_line_item_id                         AS zoho_line_item_id,
                rz.zoho_purchase_receive_id                  AS zoho_purchase_receive_id,
                rz.zoho_purchaseorder_id                     AS zoho_purchaseorder_id,
                rz.zoho_purchaseorder_number                 AS zoho_purchaseorder_number,
                rz.zoho_purchaseorder_number_norm            AS zoho_purchaseorder_number_norm,
                rz.zoho_sync_source                          AS zoho_sync_source,
                rz.zoho_last_modified_time                   AS zoho_last_modified_time,
                rz.zoho_synced_at                            AS zoho_synced_at,
                rz.zoho_notes                                AS zoho_notes,
                rz.unit_price                                AS unit_price,
                -- Mirror receipt status — same wire as ?id= / view=activity so
                -- sibling refresh after receive/Refresh cannot clobber zoho_status.
                mirror.status                                AS zoho_status,
                mirror.last_synced_at::text                  AS zoho_status_synced_at,
                  stn.tracking_number_raw AS receiving_tracking_number,
                  r.carrier,
                  r.source                     AS receiving_source,
                  r.source_platform            AS receiving_source_platform,
                r.intake_type                AS receiving_intake_type,
                  COALESCE(r.is_priority, false) AS is_priority,
                r.priority_tier                AS priority_tier,
                  r.zoho_purchaseorder_number  AS receiving_zoho_purchaseorder_number,
                  r.support_notes              AS receiving_support_notes,
                  r.zoho_notes                 AS receiving_zoho_notes,
                  r.listing_url                AS receiving_listing_url,
                  COALESCE(rt.triage_complete, false) AS triage_complete,
                  rt.triage_completed_at::text    AS triage_completed_at,
                  COALESCE(ru.intake_path = 'unbox_only', false) AS unbox_only_intake,
                  rt.door_received_at::text          AS receiving_received_at,
                  -- Carton unbox stamp — REQUIRED. normalizeRow maps row.unboxed_at
                  -- ONLY from receiving_unboxed_at, so omitting it here returned
                  -- unboxed_at:null for every line on this path. The post-receive
                  -- sibling refresh (useReceiveAction) dispatches these rows into
                  -- the unbox rail, whose {...existing, ...updated} merge then
                  -- clobbered the good unboxed_at with null → getUnboxActivityAt
                  -- collapsed → the just-received carton sank below the top-N and
                  -- DISAPPEARED. Mirror the other SELECT branches (view=activity).
                  ru.unboxed_at::text           AS receiving_unboxed_at,
                  -- Scan-based "last touched" time, matching view=activity so
                  -- package-sibling refreshes merged into the rail keep the
                  -- correct timestamp (see single-row branch above).
                  rs_agg.last_scan::text       AS last_scan_at,
                  stn.tracking_number_raw      AS shipment_tracking_number,
                  stn.carrier                  AS shipment_carrier,
                  stn.latest_status_category   AS shipment_status_category,
                  stn.is_delivered             AS shipment_is_delivered,
                  stn.delivered_at             AS shipment_delivered_at,
                  ${RECEIVING_LINE_IMAGE_URL_SQL},
                  sc.product_title             AS catalog_product_title,
                -- Zoho item title (canonical SoT). Always preferred for display
                -- over the PO line's listing-style item_name and over the
                -- marketplace catalog title — the Zoho SKU's own title governs.
                (SELECT name FROM items
                  WHERE zoho_item_id = rz.zoho_item_id AND status = 'active'
                  LIMIT 1)                   AS zoho_item_title,
                  sc.id                        AS sku_catalog_id,
                  ${sqlReceivingPhotoCount('rl.receiving_id', 'rl.organization_id')} AS photo_count,
                  ${sqlReceivingZendeskTicketColumn()}
           FROM receiving_line rl
           LEFT JOIN receiving_carton r                   ON r.id  = rl.receiving_id AND r.organization_id = rl.organization_id
           ${sqlLinkedSupportTicketLateralJoin()}
           LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
           LEFT JOIN receiving_line_zoho rz     ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
           ${PUTAWAY_STAGED_JOIN_SQL}
           LEFT JOIN zoho_po_mirror mirror
             ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
            AND mirror.organization_id = rl.organization_id
           LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
           LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
           LEFT JOIN LATERAL (
              SELECT MAX(rs.scanned_at) AS last_scan
              FROM receiving_scans rs
              WHERE rs.receiving_id = r.id
           ) rs_agg ON TRUE
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
           -- SKU IDENTITY LAW — exact + org-scoped (src/lib/sku/sku-identity-law.ts).
           LEFT JOIN sku_catalog sc                ON ${SKU_CATALOG_JOIN_ON_SQL}
           WHERE rl.receiving_id = $1 AND rl.organization_id = $2
           ORDER BY rl.id ASC`,
      params,
    },
    pkg: {
      sql:
        `SELECT rt.door_received_at::text AS received_at,
                  ru.unboxed_at::text AS unboxed_at,
                  r.created_at::text AS created_at,
                  r.return_platform::text AS return_platform,
                  r.source_platform,
                  COALESCE(r.is_return, false) AS is_return
           FROM receiving_carton r
           LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
           LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
           WHERE r.id = $1 AND r.organization_id = $2
           LIMIT 1`,
      params,
    },
  };
}

/** Inputs the paginated-list builder needs beyond the parsed query. */
export interface ReceivingLinesListSqlInput {
  query: ReceivingLinesQuery;
  orgId: string;
  /** `Number(ctx?.staffId)` — raw; may be NaN. Drives view=viewed. */
  viewerStaffId: number;
  /** `await isIncomingUniversal(orgId)` when view=incoming, else false. */
  universalIncoming: boolean;
  /** `!isReceivingPhysicalStateFirst() || hideZohoReceived` (view=scanned). */
  applyScannedZohoExclusion: boolean;
  /**
   * `isUnboxRailColumnRead()` — when true, `view=unbox_opened` membership reads
   * ONLY the committed `receiving_unbox.opened_at` column (read-after-write
   * consistent), instead of the legacy column ∪ ops_events OR-arm. Optional /
   * defaults false so the flag-off SQL stays byte-identical (build-sql.test.ts).
   */
  unboxRailColumnRead?: boolean;
  /**
   * Gate-before-decorate pre-limit for `view=scanned` (2026-08-27): the route
   * ranked the qualifying LINE ids with {@link buildScannedCandidateSql}
   * (gates only, no display laterals) and narrows this query to them. Line-
   * grained on purpose — `rl.receiving_id` is NULL for PO#-fallback lines, so
   * the carton-grained `receivingIdIn` arm would silently drop them. Optional /
   * absent keeps the SQL byte-identical to the fixture (build-sql.test.ts).
   */
  scannedLineIdIn?: readonly number[];
}

/**
 * `view=scanned` membership — door-scanned and physically in, but NOT yet
 * unboxed: the triage to-do between the door scan and the unbox step, the
 * inverse of `activity`. Shared by the main list WHERE arm and
 * {@link buildScannedCandidateSql} so the gate cannot drift between the two.
 * Alias contract: `rl` · `r` · `rt` · `ru`; interpolates the caller's
 * flag-dependent `unboxOpenedPredicate` at the tail.
 */
export function scannedViewPredicateSql(unboxOpenedPredicate: string): string {
  return `(rt.door_received_at IS NOT NULL
          OR EXISTS (SELECT 1 FROM receiving_scans rs_scanned WHERE rs_scanned.receiving_id = r.id))
         AND ru.unboxed_at IS NULL
         -- Ops event spine: a carton that's been unboxed must never leak back
         -- into the triage "to unbox" queue even if legacy stamps (unboxed_at /
         -- qty_received / workflow_status) failed to roll up.
         AND NOT EXISTS (
           SELECT 1 FROM ops_events oe_unbox
            WHERE oe_unbox.organization_id = rl.organization_id
              AND oe_unbox.entity_type = 'receiving'
              AND oe_unbox.entity_id = r.id
              AND oe_unbox.event_type = 'UNBOX_CONFIRMED'
         )
         AND COALESCE(rl.quantity_received, 0) = 0
         AND (rl.workflow_status IS NULL
              OR rl.workflow_status IN ('EXPECTED','ARRIVED','MATCHED'))
         -- …and the line has produced NO units. A serial_unit means the carton
         -- was already unboxed/labeled/received at the unit level — but a
         -- unit-level receive doesn't always roll up to the line's
         -- quantity_received / workflow_status / receiving_carton.unboxed_at, so those
         -- alone let an already-unboxed carton leak back into the "to unbox"
         -- queue. Origin-line existence is the authoritative "this was opened"
         -- signal, so exclude it here.
         AND NOT EXISTS (
           SELECT 1 FROM serial_unit_provenance p
            WHERE p.origin_type = 'RECEIVING_LINE' AND p.origin_id = rl.id
              AND p.organization_id = rl.organization_id
         )
         -- Unbox-surface scans belong in view=unbox_opened only — never triage.
         AND NOT ${unboxOpenedPredicate}`;
}

/**
 * Gate-before-decorate candidate ranking for `view=scanned&sort=priority` —
 * the /triage rail's cold-load shape.
 *
 * The full list query runs ~15 display laterals over EVERY candidate its join
 * graph admits and only then applies the scanned gates. Measured 2026-08-27
 * (EXPLAIN ANALYZE, warm, dogfood org): 317 candidates decorated, 19
 * survivors — 368ms / 54,985 shared buffers to return 19 rows. This query is
 * the SAME gates ({@link scannedViewPredicateSql} — one predicate, two
 * consumers, no drift) and the same priority ORDER BY with zero decorations;
 * the caller narrows the real list query to the ids it names
 * (`scannedLineIdIn`), so the laterals only decorate rows that can reach the
 * page. Same mechanism as `maybePreLimitUnboxOpened`, line-grained.
 */
export function buildScannedCandidateSql(input: {
  orgId: string;
  limit: number;
  applyScannedZohoExclusion: boolean;
  unboxRailColumnRead: boolean;
}): BuiltSql {
  const unboxOpenedPredicate = unboxOpenedPredicateSql(input.unboxRailColumnRead === true);
  const zohoArm = input.applyScannedZohoExclusion
    ? `\n          AND ${NOT_ZOHO_RECEIVED_PREDICATE}`
    : '';
  return {
    sql: `SELECT rl.id
         FROM receiving_line rl
         LEFT JOIN receiving_line_zoho rz     ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         LEFT JOIN zoho_po_mirror mirror
           ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
          AND mirror.organization_id = rl.organization_id
         -- D1 wrong-shipment guard, verbatim from the list query: direct FK
         -- wins, else prefer a row that carries a shipment, else the newest.
         LEFT JOIN LATERAL (
           SELECT r.* FROM receiving_carton r
            WHERE r.organization_id = rl.organization_id
              AND (r.id = rl.receiving_id
               OR (rl.receiving_id IS NULL
                   AND r.source = 'zoho_po'
                   AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id)
               OR (rl.receiving_id IS NULL
                   AND ${INBOUND_MARKETPLACE_CARTON_SOURCES_SQL}
                   AND r.source_order_id = rl.source_order_id
                   AND r.organization_id = rl.organization_id))
            ORDER BY (r.id = rl.receiving_id) DESC,
                     (r.shipment_id IS NOT NULL) DESC,
                     r.id DESC
            LIMIT 1
         ) r ON TRUE
         LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
         LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
        WHERE rl.organization_id = $1
          AND ${scannedViewPredicateSql(unboxOpenedPredicate)}${zohoArm}
        ORDER BY ${RECEIVING_PRIORITY_RANK_SQL} ASC, ${RECEIVING_LANE_RANK_SQL} ASC, rt.door_received_at::text DESC NULLS LAST, rl.id DESC
        LIMIT $2`,
    params: [input.orgId, input.limit],
  };
}

/**
 * Paginated list — all lines, optionally filtered — plus the sibling COUNT.
 * Byte-identical move of the route's dynamic WHERE / ORDER BY / SELECT
 * assembly; param ordering is deterministic and pinned by build-sql.test.ts.
 */
export function buildReceivingLinesListSql(input: ReceivingLinesListSqlInput): BuiltListSql {
  const {
    search, searchField, searchScope, qaFilter, dispFilter, workflowFilter,
    view, deliveryStateFilter, poFrom, poTo,
    incomingSort, historySort, wantsPrioritySort, testerId, returnScope, priorityOnly, weekStart, weekEnd, limit, offset,
    inboundSourceParam, incomingLinkParam, inboundKindParam, staffFilterRaw, staffFilterId,
    unboxQueueStage, unboxQueueLane, trackingIn, receivingIdIn,
  } = input.query;
  /**
   * The operator named specific trackings, so this query is about THOSE ROWS —
   * not about the lane's default population. Relaxes the Incoming lane's
   * vendor-receipt predicate and its delivery-state facet (below); everything
   * else about the view is untouched.
   *
   * Without the relaxation the naive shape is worse than useless: paste 40,
   * filter, see 34, and the six the vendor already marked received vanish with
   * no explanation — the exact invisibility `?tracking_in=` exists to end. The
   * bypass is scoped to this param and never applied globally; the default lane
   * keeps its predicate under paste filter
   * because the claim is no longer true.
   */
  const trackingInActive = trackingIn.length > 0;
  const { orgId, viewerStaffId, universalIncoming, applyScannedZohoExclusion } = input;
  // view=unbox_opened membership predicate — column-only (read-after-write
  // consistent) when the flag is on, else the legacy OR-arm. Defaulting the
  // flag to false keeps the emitted SQL byte-identical (pinned by build-sql.test.ts).
  const unboxOpenedPredicate = unboxOpenedPredicateSql(input.unboxRailColumnRead === true);

  // view=viewed only: the requesting operator, whose recently-opened lines
  // (receiving_line_views) this feed returns. `viewedParamIdx` is the $N of the
  // staff_id param once pushed, reused by the WHERE / ORDER BY / SELECT below.
  let viewedParamIdx = 0;
  let testingTesterParamIdx = 0;
  let testingWeekStartParamIdx = 0;
  let testingWeekEndParamIdx = 0;

  // org gate FIRST so every dynamic predicate below sits on a tenant-scoped
  // base set (and the shared count query inherits it via the same `where`).
  const conditions: string[] = [];
  const values: unknown[]    = [];
  let idx = 1;

  conditions.push(`rl.organization_id = $${idx++}`);
  values.push(orgId);

  // Bulk tracking paste — INDEXED EQUALITY against the unique btree on
  // `tracking_number_normalized`. Deliberately no last-8 `OR` arm: what an
  // operator pastes IS the canonical stored form, and the same `OR` measured on
  // the sibling lookup planned as a nested-loop seq scan at ~357k cost for a
  // SINGLE key. Scan-side prefix tolerance belongs in the scan matcher, which
  // already has it.
  if (trackingInActive) {
    conditions.push(`stn.tracking_number_normalized = ANY($${idx++}::text[])`);
    values.push(trackingIn);
  }

  // Pre-limit: restrict the candidate set to cartons named by the caller, which
  // ranked them with a cheap read on the ordering column alone. Everything else
  // about the query is unchanged — this only stops the display laterals from
  // running over rows that could never reach the page. Omitted when empty, so
  // the no-param SQL stays byte-identical to `legacy-route-sql.fixture.ts`.
  if (receivingIdIn.length > 0) {
    conditions.push(`rl.receiving_id = ANY($${idx++}::int[])`);
    values.push(receivingIdIn);
  }

  // Gate-before-decorate pre-limit (view=scanned): the route ranked the
  // qualifying LINE ids with buildScannedCandidateSql (the same gates, no
  // display laterals) and narrows this query to them. Line-grained on purpose
  // — rl.receiving_id is NULL for PO#-fallback lines, so the carton-grained
  // arm above would silently drop them. Omitted when absent, so the no-param
  // SQL stays byte-identical to `legacy-route-sql.fixture.ts`.
  const scannedLineIdIn = input.scannedLineIdIn ?? [];
  if (scannedLineIdIn.length > 0) {
    conditions.push(`rl.id = ANY($${idx++}::int[])`);
    values.push([...scannedLineIdIn]);
  }

  if (search) {
    const p = `%${search}%`;
    // Carton/handle QR payloads are `R-<id>` (see src/lib/barcode-routing.ts).
    // Treat that as an explicit receiving_id equality so scanning a label
    // narrows the list to that package.
    const rcvIdMatch = /^R-(\d+)$/i.exec(search);
    const rcvIdEq = rcvIdMatch ? Number(rcvIdMatch[1]) : NaN;
    switch (searchField) {
      case 'po':
        conditions.push(
          `(COALESCE(rz.zoho_purchaseorder_id::text, '') ILIKE $${idx}
             OR COALESCE(rz.zoho_purchaseorder_number, '') ILIKE $${idx}
             OR COALESCE(rl.source_order_id, '') ILIKE $${idx}
             OR COALESCE(r.zoho_purchaseorder_number, '') ILIKE $${idx})`,
        );
        values.push(p);
        idx++;
        break;
      case 'tracking':
        conditions.push(
          `(COALESCE(stn.tracking_number_raw, '') ILIKE $${idx}
             OR COALESCE(stn.tracking_number_raw, '') ILIKE $${idx}
             OR COALESCE(stn.tracking_number_normalized, '') ILIKE $${idx})`,
        );
        values.push(p);
        idx++;
        break;
      case 'sku':
        conditions.push(
          `(COALESCE(rl.sku, '') ILIKE $${idx}
             OR COALESCE(rz.zoho_item_id, '') ILIKE $${idx})`,
        );
        values.push(p);
        idx++;
        break;
      case 'product':
        conditions.push(`COALESCE(rl.item_name, '') ILIKE $${idx}`);
        values.push(p);
        idx++;
        break;
      case 'serial':
        conditions.push(
          `EXISTS (
               SELECT 1 FROM serial_units su_hist
               WHERE su_hist.organization_id = rl.organization_id
                 AND COALESCE(su_hist.serial_number, '') ILIKE $${idx}
                 AND ${currentLineIsMatchSql('su_hist')}
             )`,
        );
        values.push(p);
        idx++;
        break;
      default: {
        const patternIdx = idx;
        const orClauses = [
          `COALESCE(rl.item_name, '') ILIKE $${patternIdx}`,
          `COALESCE(rl.sku, '') ILIKE $${patternIdx}`,
          `COALESCE(rz.zoho_purchaseorder_id::text, '') ILIKE $${patternIdx}`,
          `COALESCE(rz.zoho_purchaseorder_number, '') ILIKE $${patternIdx}`,
          `COALESCE(rl.source_order_id, '') ILIKE $${patternIdx}`,
          `COALESCE(rz.zoho_item_id, '') ILIKE $${patternIdx}`,
          `COALESCE(r.zoho_purchaseorder_number, '') ILIKE $${patternIdx}`,
          `COALESCE(stn.tracking_number_raw, '') ILIKE $${patternIdx}`,
          `COALESCE(stn.tracking_number_raw, '') ILIKE $${patternIdx}`,
          `COALESCE(stn.tracking_number_normalized, '') ILIKE $${patternIdx}`,
          `EXISTS (
               SELECT 1 FROM serial_units su_all
               WHERE su_all.organization_id = rl.organization_id
                 AND COALESCE(su_all.serial_number, '') ILIKE $${patternIdx}
                 AND ${currentLineIsMatchSql('su_all')}
             )`,
        ];
        values.push(p);
        idx++;

        if (Number.isFinite(rcvIdEq)) {
          orClauses.push(`rl.receiving_id = $${idx}`);
          values.push(rcvIdEq);
          idx++;
        }

        conditions.push(`(${orClauses.join(' OR ')})`);
        break;
      }
    }
  }
  if (searchScope === 'zoho_po') {
    conditions.push(`r.source = $${idx}`);
    values.push('zoho_po');
    idx++;
  } else if (searchScope === 'unmatched') {
    conditions.push(`r.source = $${idx}`);
    values.push('unmatched');
    idx++;
  }
  if (qaFilter && QA_STATUSES.has(qaFilter)) {
    conditions.push(`rlt.qa_status = $${idx++}`);
    values.push(qaFilter);
  }
  if (dispFilter && DISPOSITIONS.has(dispFilter)) {
    conditions.push(`rlt.disposition_code = $${idx++}`);
    values.push(dispFilter);
  }
  if (workflowFilter && WORKFLOW_STATUSES.has(workflowFilter)) {
    conditions.push(`rl.workflow_status = $${idx++}::inbound_workflow_status_enum`);
    values.push(workflowFilter);
  }
  // Universal staff filter (P1-WORK-02): narrow the carton list to one staff —
  // who received, unboxed, or first-scanned it. Absent = ALL staff (default).
  if (staffFilterRaw && Number.isFinite(staffFilterId) && staffFilterId > 0) {
    const unboxActorClause =
      view === 'unbox_opened'
        ? ` OR ru.opened_by = $${idx} OR EXISTS (
               SELECT 1 FROM ops_events oe_ub
                WHERE oe_ub.organization_id = r.organization_id
                  AND oe_ub.entity_type = 'receiving'
                  AND oe_ub.entity_id = r.id
                  AND oe_ub.event_type = 'UNBOX_SCAN_OPENED'
                  AND oe_ub.actor_staff_id = $${idx}
             )`
        : '';
    conditions.push(
      `(rt.door_received_by = $${idx} OR ru.unboxed_by = $${idx} OR EXISTS (
           SELECT 1 FROM receiving_scans rs_staff
           WHERE rs_staff.receiving_id = r.id AND rs_staff.scanned_by = $${idx}
         )${unboxActorClause})`,
    );
    values.push(staffFilterId);
    idx++;
  }
  // Unbox Queue staging facets (`?ustage=` / `?ulane=`). Staged = shelf + lane
  // (isArrivalStaged). Only emitted by unbox_queue buildParams.
  if (unboxQueueStage === 'staged') {
    conditions.push(STAGING_STAGED_PREDICATE_SQL);
  } else if (unboxQueueStage === 'unstaged') {
    conditions.push(STAGING_UNSTAGED_PREDICATE_SQL);
  }
  if (unboxQueueLane) {
    conditions.push(`rt.priority_lane = $${idx++}`);
    values.push(unboxQueueLane);
  }
  // `view` selects the WHERE arm; no/unknown view = the org-wide default set.
  // (Wave-2 dead-arm removal: `view=recent` and the no-view ?week_start/
  // ?week_end fallback had zero consumers and were deleted.)
  if (view === 'received') {
    // "Received" = physically in the warehouse. Anything from MATCHED
    // onward qualifies (the row strip labels MATCHED as "RECEIVED").
    // Terminal fails (SCRAP, RTV, FAILED) are excluded — they land in
    // the per-status filters instead.
    conditions.push(
      `rl.workflow_status IN ('MATCHED','UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE')`,
    );
  } else if (view === 'all') {
    // Union of recent + received, INCLUDING terminal fails (FAILED/RTV/
    // SCRAP) — "all" is the search/scan-resolution dataset, and excluding
    // failed lines made a tested-failed PO unfindable from the unbox scan
    // bar and History search. Includes NULL workflow_status so legacy rows
    // without a status still appear.
    conditions.push(
      `(rl.workflow_status IS NULL OR rl.workflow_status IN ('EXPECTED','ARRIVED','MATCHED','UNBOXED','AWAITING_TEST','IN_TEST','PASSED','FAILED','RTV','SCRAP','DONE'))`,
    );
  } else if (view === 'activity') {
    // "Activity" = Unbox History membership: items in the UNBOXING pipeline
    // only. A carton merely scanned at the door (workflow MATCHED / ARRIVED
    // with nothing received and no unbox timestamp) is intentionally EXCLUDED
    // — door scans belong in Queue / Unfound triage, not History. A line
    // qualifies once it has actually been unboxed/received: workflow advanced
    // to UNBOXED or beyond, OR quantity_received > 0, OR its carton has an
    // unboxed_at stamp. Lineless unmatched placeholders use the same Unbox-
    // touched rule in buildUnmatchedPlaceholdersSql.
    conditions.push(
      `(
           rl.workflow_status IN ('UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE')
           OR COALESCE(rl.quantity_received, 0) > 0
           OR ru.unboxed_at IS NOT NULL
         )`,
    );
  } else if (view === 'scanned') {
    // "Scanned" = door-scanned and physically in, but NOT yet unboxed — the
    // triage to-do between the door scan and the unbox step. The inverse of
    // `activity`: the carton has a received_at stamp (someone scanned it in)
    // but no unbox stamp and nothing received on the line yet. A line drops
    // off the instant it's unboxed (unboxed_at set, qty>0, or workflow
    // advances), where it surfaces in the unbox/activity rail instead.
    // "Scanned" = physically at the dock. received_at is the intended signal,
    // but the Incoming sync pre-creates a zoho_po receiving row (received_at
    // NULL) for every issued PO, and historically the door scan's upsert hit
    // ON CONFLICT and never stamped it — so keying solely on received_at left
    // the whole Prioritize / unbox Queue empty. The door scan ALWAYS writes a
    // receiving_scans row, so treat an existing scan as proof of arrival too.
    // Self-healing for rows scanned before the upsert was fixed; new scans now
    // stamp received_at directly. The predicate text lives in
    // scannedViewPredicateSql, shared with buildScannedCandidateSql.
    conditions.push(scannedViewPredicateSql(unboxOpenedPredicate));
    // Phase 2: only hide Zoho-received POs when the physical-state-first flag
    // is off OR the operator opted in via the "Hide Zoho-received" toggle
    // (?zohoStatus=open). By default a physically-present box stays in the
    // queue with a `zoho_status` badge rather than silently vanishing.
    if (applyScannedZohoExclusion) {
      conditions.push(NOT_ZOHO_RECEIVED_PREDICATE);
    }
    if (priorityOnly) {
      // Unbox Urgent: same explicit priority / tier predicate as Testing Urgent.
      conditions.push(
        `(COALESCE(r.is_priority, false) = true OR r.priority_tier IS NOT NULL)`,
      );
    }
  } else if (view === 'unbox_opened') {
    // Unbox sidebar work queue: every carton the operator scanned on the Unbox
    // surface, found or unfound, unboxed or not. Membership reads the committed
    // opened_at column (column-only when the flag is on; see unboxOpenedPredicate).
    conditions.push(unboxOpenedPredicate);
  } else if (view === 'testing') {
    // "Testing" = the recently-tested feed, backed by the testing_results
    // log. A line qualifies once it has at least one recorded verdict; when
    // a tester is supplied we scope to that staff's own tested items. Ordered
    // by rl.updated_at below — the per-verdict line rollup bumps it, so the
    // most recently tested rises to the top.
    if (weekStart && weekEnd) {
      if (Number.isFinite(testerId) && testerId > 0) {
        testingTesterParamIdx = idx++;
        values.push(testerId);
      }
      testingWeekStartParamIdx = idx++;
      testingWeekEndParamIdx = idx++;
      values.push(weekStart, weekEnd);
    } else if (Number.isFinite(testerId) && testerId > 0) {
      conditions.push(
        `EXISTS (SELECT 1 FROM testing_results tr
                    WHERE tr.receiving_line_id = rl.id AND tr.tested_by = $${idx})`,
      );
      values.push(testerId);
      idx++;
    } else {
      conditions.push(
        `EXISTS (SELECT 1 FROM testing_results tr WHERE tr.receiving_line_id = rl.id)`,
      );
    }
  } else if (view === 'needs-test') {
    // "Needs-test" = the testing TO-DO feed. A unit qualifies once it is
    // PHYSICALLY received (workflow advanced to UNBOXED/AWAITING_TEST/IN_TEST,
    // or quantity_received > 0) AND flagged needs_test, but has NOT reached a
    // terminal verdict yet (PASSED/DONE/FAILED/RTV/SCRAP drop off — they're
    // done). Ordered newest-received-first below so freshly-unboxed units
    // surface at the top for real-time pickup. When a tester is supplied we
    // scope to that tech's own assignments (assigned_tech_id) so each tech's
    // queue is theirs; unassigned units still show in the all-staff feed.
    conditions.push(
      `COALESCE(rlt.needs_test, false) = true
         AND (rl.workflow_status IS NULL
              OR rl.workflow_status NOT IN ('PASSED','DONE','FAILED','RTV','SCRAP'))
         AND (
           rl.workflow_status IN ('UNBOXED','AWAITING_TEST','IN_TEST')
           OR COALESCE(rl.quantity_received, 0) > 0
           OR ru.unboxed_at IS NOT NULL
         )`,
    );
    if (returnScope === 'returns') {
      conditions.push('COALESCE(r.is_return, false) = true');
    } else if (returnScope === 'standard') {
      conditions.push('COALESCE(r.is_return, false) = false');
    }
    if (priorityOnly) {
      // Urgent tab: explicit priority flag or manual tier override.
      conditions.push(
        `(COALESCE(r.is_priority, false) = true OR r.priority_tier IS NOT NULL)`,
      );
    }
    if (Number.isFinite(testerId) && testerId > 0) {
      conditions.push(`rlt.assigned_tech_id = $${idx}`);
      values.push(testerId);
      idx++;
    }
  } else if (view === 'testing_opened') {
    // QC Recent = lines THIS operator opened on Quality Control
    // (receiving_line_testing_opens, upserted on open). Isolated from Unbox
    // receiving_line_views. Unknown viewer → empty feed.
    if (Number.isFinite(viewerStaffId) && viewerStaffId > 0) {
      viewedParamIdx = idx;
      values.push(viewerStaffId);
      idx++;
      conditions.push(
        `EXISTS (SELECT 1 FROM receiving_line_testing_opens o
                    WHERE o.receiving_line_id = rl.id AND o.staff_id = $${viewedParamIdx})`,
      );
    } else {
      conditions.push('FALSE');
    }
  } else if (view === 'viewed') {
    // "Viewed" = lines THIS operator recently opened in the receiving
    // workspace (receiving_line_views, upserted on open). Scoped to one staff;
    // ordered by viewed_at DESC below. Unknown viewer → empty feed.
    if (Number.isFinite(viewerStaffId) && viewerStaffId > 0) {
      viewedParamIdx = idx;
      values.push(viewerStaffId);
      idx++;
      conditions.push(
        `EXISTS (SELECT 1 FROM receiving_line_views v
                    WHERE v.receiving_line_id = rl.id AND v.staff_id = $${viewedParamIdx})`,
      );
    } else {
      conditions.push('FALSE');
    }
  } else if (view === 'incoming') {
    // "Incoming" = on a Zoho PO, vendor has issued it, warehouse hasn't
    // touched it yet. Backed by the /api/cron/zoho/incoming-po-sync delta
    // poller. A row drops off this view the instant the operator scans
    // or marks-received against it (workflow advances past EXPECTED OR
    // quantity_received goes positive). Unmatched cartons stay in their
    // own pill — this view is strictly Zoho-sourced expected work.
    if (!universalIncoming) {
      // Legacy Zoho-only Incoming (unchanged): on a Zoho PO, EXPECTED, untouched.
      // The vendor-receipt guard is dropped entirely under `?tracking_in=` —
      // emitted as an empty interpolation rather than a commented-out line, so
      // the no-param SQL stays byte-identical to `legacy-route-sql.fixture.ts`.
      conditions.push(
        `rl.workflow_status = 'EXPECTED'
           AND COALESCE(rl.quantity_received, 0) = 0
           AND rz.zoho_purchaseorder_id IS NOT NULL
           -- Hide POs Zoho now reports received/closed/cancelled (mirror status),
           -- so a received order drops off Incoming after a Refresh-Zoho sync.
           ${trackingInActive ? '' : `AND ${NOT_ZOHO_RECEIVED_PREDICATE}`}
           -- Honor this view's contract: a row drops off "the instant the operator
           -- scans". A door scan writes receiving_scans against the carton's
           -- receiving row but never advances this Zoho-PO line's workflow_status /
           -- quantity_received (the line's receiving_id is often NULL), so without
           -- this guard a scanned/unboxed box stays stuck in Incoming and renders
           -- as delivery_state='UNKNOWN'. Shipment-anchored so it agrees with the
           -- delivered-unscanned tile count (count === rows).
           AND NOT ${SHIPMENT_SCANNED_PREDICATE}`,
      );
    } else {
      // Universal Incoming (plan §6.1): a line qualifies if it's a Zoho PO not
      // yet received (this INCLUDES eBay→Zoho merged lines, which carry the zoho
      // PO id and are governed by the Zoho mirror), OR an eBay-only buyer line
      // (no zoho PO, governed by the eBay mirror). Same SHIPMENT_SCANNED drop-off.
      // The vendor-receipt guard sits INSIDE each source arm, so the relaxation
      // has to be applied per arm — dropping the whole OR would also drop the
      // "which source is this line from" membership test it is bracketed with.
      conditions.push(
        `rl.workflow_status = 'EXPECTED'
           AND COALESCE(rl.quantity_received, 0) = 0
           AND (
             (rz.zoho_purchaseorder_id IS NOT NULL${trackingInActive ? '' : ` AND ${NOT_ZOHO_RECEIVED_PREDICATE}`})
             OR
             (rz.zoho_purchaseorder_id IS NULL
              AND ${INBOUND_MARKETPLACE_LINE_SOURCES_SQL}${trackingInActive ? '' : `
              AND ${notLineInboundMirrorTerminalPredicate()}`})
           )
           AND NOT ${SHIPMENT_SCANNED_PREDICATE}`,
      );
      // ?inbound facet — filter by PRIMARY source (merged lines keep marketplace type).
      if (
        inboundSourceParam === 'ebay'
        || inboundSourceParam === 'amazon'
        || inboundSourceParam === 'manual'
      ) {
        conditions.push(`rl.inbound_source_type = '${inboundSourceParam}'`);
      } else if (inboundSourceParam === 'zoho') {
        conditions.push(
          `(rl.inbound_source_type = 'zoho' OR (rl.inbound_source_type IS NULL AND rz.zoho_purchaseorder_id IS NOT NULL))`,
        );
      }
      // ?inkind= — purchase vs return intake on the spine.
      if (inboundKindParam === 'return') {
        conditions.push(
          `(UPPER(COALESCE(rl.receiving_type, '')) = 'RETURN'
            OR EXISTS (
              SELECT 1 FROM receiving_line_return rlr
               WHERE rlr.receiving_line_id = rl.id
                 AND rlr.organization_id = rl.organization_id
            ))`,
        );
      } else if (inboundKindParam === 'purchase') {
        conditions.push(
          `UPPER(COALESCE(rl.receiving_type, 'PO')) <> 'RETURN'
            AND NOT EXISTS (
              SELECT 1 FROM receiving_line_return rlr
               WHERE rlr.receiving_line_id = rl.id
                 AND rlr.organization_id = rl.organization_id
            )`,
        );
      }
      // ?link=zoho_pending — marketplace lines still awaiting their Zoho PO.
      if (incomingLinkParam === 'zoho_pending') {
        conditions.push(`rz.zoho_purchaseorder_id IS NULL`);
      }
    }

    // Optional delivery_state facet filter. Each bucket is the exact same
    // predicate the CASE expression in the SELECT below uses so the chip
    // counts in IncomingSidebarPanel stay consistent with the rendered rows.
    //
    // Suppressed under `?tracking_in=`: an armed facet would silently drop
    // pasted trackings whose delivery state happens not to match, which is the
    // same "where did my row go" defect from a second direction. Naming a
    // tracking outranks a facet the operator armed earlier.
    if (trackingInActive) {
      // no facet narrowing — the pasted keys ARE the filter
    } else if (deliveryStateFilter === 'DELIVERED_UNOPENED') {
      // Carrier delivered the box AND no operator scan happened yet at the
      // receiving station. `receiving_scans` is written by /lookup-po the
      // moment someone scans the tracking#, so its absence is the precise
      // "this box is here but nobody has touched it" signal.
      conditions.push(
        `stn.is_delivered = true
           AND NOT ${SHIPMENT_SCANNED_PREDICATE}`,
      );
    } else if (deliveryStateFilter === 'DELIVERED_NOT_UNBOXED') {
      // Carrier delivered + warehouse has not unboxed yet (broader than
      // DELIVERED_UNOPENED — includes dock-scanned cartons still waiting to
      // unbox). Dedicated feed is preferred when this facet is active because
      // view=incoming excludes scanned rows via SHIPMENT_SCANNED_PREDICATE.
      conditions.push(
        `stn.is_delivered = true
           AND COALESCE(rl.quantity_received, 0) = 0
           AND (r.id IS NULL OR ru.unboxed_at IS NULL)
           AND rl.workflow_status NOT IN (
             'UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE','FAILED','RTV','SCRAP'
           )`,
      );
    } else if (deliveryStateFilter === 'ARRIVING_TODAY') {
      conditions.push(`stn.latest_status_category = 'OUT_FOR_DELIVERY'`);
    } else if (deliveryStateFilter === 'STALLED') {
      // Shipment is alive (not terminal, not delivered) but either the carrier
      // flagged an exception or no new scan has landed in >72h. This is the
      // "vendor said it shipped but it isn't actually moving" bucket — the
      // single highest-value receiving signal to surface ahead of the day.
      conditions.push(
        `stn.id IS NOT NULL
           AND COALESCE(stn.is_terminal, false) = false
           AND COALESCE(stn.is_delivered, false) = false
           AND (
             stn.has_exception = true
             OR (
               stn.latest_event_at IS NOT NULL
               AND stn.latest_event_at < (NOW() - interval '72 hours')
             )
           )`,
      );
    } else if (deliveryStateFilter === 'IN_TRANSIT') {
      conditions.push(
        `stn.latest_status_category IN ('IN_TRANSIT','ACCEPTED','LABEL_CREATED')`,
      );
    } else if (deliveryStateFilter === 'AWAITING_TRACKING') {
      // Strictly: no carrier tracking# registered. Distinct from
      // PENDING_CARRIER (tracking# exists, no status pulled yet).
      conditions.push(`stn.id IS NULL`);
    } else if (deliveryStateFilter === 'PENDING_CARRIER') {
      // Tracking# is registered with a known carrier but the carrier sync
      // hasn't returned a useful status (NULL / UNKNOWN). Common right
      // after registration; also catches USPS shipments where the sync
      // adapter isn't returning a category. Different from AWAITING_TRACKING
      // because the tracking chip on the row is real and clickable.
      conditions.push(
        `stn.id IS NOT NULL
            AND (stn.latest_status_category IS NULL OR stn.latest_status_category = 'UNKNOWN')
            AND NOT ${CARRIER_MISMATCH_PREDICATE}`,
      );
    } else if (deliveryStateFilter === 'CARRIER_MISMATCH') {
      // Carrier/number don't match: no known carrier for the tracking#, or the
      // carrier API has no record of it. Same predicate the CASE above uses.
      conditions.push(CARRIER_MISMATCH_PREDICATE);
    }

    // PO purchase-date range filter. Joins zoho_po_mirror (already joined
    // via incomingExtrasJoin) so we use its `po_date` (Zoho's PO date).
    // Falls back to local created_at when the mirror doesn't have the PO
    // yet (rare — happens only between cron tick + receive).
    if (poFrom) {
      conditions.push(
        `COALESCE(mirror.po_date::text, rl.created_at::date::text) >= $${idx++}`,
      );
      values.push(poFrom);
    }
    if (poTo) {
      conditions.push(
        `COALESCE(mirror.po_date::text, rl.created_at::date::text) <= $${idx++}`,
      );
      values.push(poTo);
    }
  } else if (view === 'incoming_removed') {
    // "Where did it go" — the inverse of `incoming`. Same inbound spine
    // (a purchasing-source PO line, or an eBay buyer line under Universal
    // Incoming), minus the EXPECTED/untouched membership that a departed row
    // no longer satisfies, plus at least one recorded exit inside the window.
    conditions.push(
      `(rz.zoho_purchaseorder_id IS NOT NULL OR ${INBOUND_MARKETPLACE_LINE_SOURCES_SQL})
         AND ${incomingRemovedExitsSql(INCOMING_REMOVED_WINDOW_DAYS, DELIVERED_UNSCANNED_WINDOW_DAYS)}`,
    );
    // The purchasing-source tab travels with the operator from the lane they
    // came from — a removed row is still an inbound row from some source.
    if (
      inboundSourceParam === 'ebay'
      || inboundSourceParam === 'amazon'
      || inboundSourceParam === 'manual'
    ) {
      conditions.push(`rl.inbound_source_type = '${inboundSourceParam}'`);
    } else if (inboundSourceParam === 'zoho') {
      conditions.push(
        `(rl.inbound_source_type = 'zoho' OR (rl.inbound_source_type IS NULL AND rz.zoho_purchaseorder_id IS NOT NULL))`,
      );
    }
    if (inboundKindParam === 'return') {
      conditions.push(`UPPER(COALESCE(rl.receiving_type, '')) = 'RETURN'`);
    } else if (inboundKindParam === 'purchase') {
      conditions.push(`UPPER(COALESCE(rl.receiving_type, 'PO')) <> 'RETURN'`);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // view=all/activity sort by the most recent tracking→PO pairing event for
  // the carton (max receiving_scans.scanned_at), so freshly-paired lines rise
  // to the top. Falls back to the triage door stamp (rt.door_received_at),
  // then rl.created_at.
  // view=received sorts by updated_at (when the line was last touched).
  // Default mirrors the prior behavior.
  // Incoming uses its own sort axis driven by `?sort=`:
  //   zoho_newest     — Zoho PO date DESC (most recently issued first)
  //   zoho_oldest     — Zoho PO date ASC (clear oldest backlog first)
  //   expected_soonest — vendor-promised delivery date ASC (today first)
  //   recently_added  — local created_at DESC (most recent sync hit)
  // NULL po_date values sort last in either direction.
  const incomingOrderBy =
    incomingSort === 'zoho_oldest'
      ? `ORDER BY mirror.po_date ASC NULLS LAST, rl.id ASC`
      : incomingSort === 'expected_soonest'
        ? `ORDER BY mirror.expected_delivery_date ASC NULLS LAST, rl.id ASC`
        : incomingSort === 'recently_added'
          ? `ORDER BY rl.created_at DESC, rl.id DESC`
          : `ORDER BY mirror.po_date DESC NULLS LAST, rl.id DESC`;
  let orderBy =
    view === 'incoming'
      ? incomingOrderBy
      // Most recently departed first — the lane answers "where did the thing I
      // was just looking at go", so recency IS the ranking. Rows whose only exit
      // is the vendor's therefore sort by the poll that noticed it; that is the
      // honest anchor until `status_changed_at` exists, and the row's own face
      // says as much rather than claiming a transition time.
      : view === 'incoming_removed'
        ? `ORDER BY removed_at DESC NULLS LAST, rl.id DESC`
      : view === 'all' || view === 'activity'
        ? (historySort === 'unboxed_newest'
            // Match Unboxed sidebar first-open axis: opened_at, then unboxed_at.
            // Re-scans must not reorder (opened_at is COALESCE-once); legacy rows
            // without an open stamp still sort by unbox-complete time.
            ? `ORDER BY COALESCE(ru.opened_at::text, unbox_open.unbox_opened_at::text, ru.unboxed_at::text) DESC NULLS LAST, rl.id DESC`
            : historySort === 'received_newest'
              // "Received" = the line's terminal DONE transition. Not yet-DONE
              // lines have a NULL received_done_at and sort last.
              ? `ORDER BY rl.received_done_at::text DESC NULLS LAST, rl.id DESC`
            : historySort === 'unbox_activity'
              // GREATEST skips NULLs in Postgres, so this is "unbox time or
              // last line write, whichever is later"; created_at backstops
              // rows with neither.
              ? `ORDER BY COALESCE(GREATEST(ru.unboxed_at, rl.updated_at)::text, rl.created_at::text) DESC NULLS LAST, rl.id DESC`
            : historySort === 'scanned_oldest'
              ? `ORDER BY COALESCE(scan_first.scanned_at::text, rt.door_received_at::text, rl.created_at::text) ASC, rl.id ASC`
              : `ORDER BY COALESCE(scan_first.scanned_at::text, rt.door_received_at::text, rl.created_at::text) DESC, rl.id DESC`)
        : view === 'scanned'
          // Newest door-scan first — the triage to-do reads like an inbox.
          ? `ORDER BY rt.door_received_at::text DESC NULLS LAST, rl.id DESC`
        : view === 'unbox_opened'
          // First Unbox-open wins (COALESCE-once ru.opened_at). Re-scans append
          // ops_events but must NOT reorder the rail — ops MAX is legacy fallback
          // only when the column is missing. Never fall through to triage door times.
          ? `ORDER BY COALESCE(ru.opened_at::text, unbox_open.unbox_opened_at::text) DESC NULLS LAST, rl.id DESC`
        : view === 'testing'
          // Sort the "tested" feed by the SAME verdict time the rail renders
          // (tr_agg.tested_at) so the timeline reads monotonically. Ordering by
          // rl.updated_at instead let a non-test edit (or another tester's
          // verdict) bump a line above items this tester verified more recently.
          ? `ORDER BY tr_agg.tested_at DESC NULLS LAST, rl.id DESC`
          : view === 'needs-test'
            // Newest-received first — the testing to-do reads like an inbox
            // with the freshest units at the top. Unbox time is the truest
            // "just arrived for testing" axis; fall back to the door scan,
            // then the line's own write/create time.
            ? `ORDER BY COALESCE(ru.unboxed_at, rt.door_received_at, rl.updated_at, rl.created_at)::text DESC NULLS LAST, rl.id DESC`
          : view === 'testing_opened'
            // Newest QC-open first — recents, not career verdicts.
            ? (viewedParamIdx > 0
                ? `ORDER BY (SELECT o.opened_at FROM receiving_line_testing_opens o WHERE o.receiving_line_id = rl.id AND o.staff_id = $${viewedParamIdx}) DESC NULLS LAST, rl.id DESC`
                : `ORDER BY rl.id DESC`)
          : view === 'viewed'
            // Newest-opened first — your recents read like a back button.
            ? (viewedParamIdx > 0
                ? `ORDER BY (SELECT v.viewed_at FROM receiving_line_views v WHERE v.receiving_line_id = rl.id AND v.staff_id = $${viewedParamIdx}) DESC NULLS LAST, rl.id DESC`
                : `ORDER BY rl.id DESC`)
          : view === 'received'
            ? `ORDER BY COALESCE(rl.updated_at::text, rl.created_at::text) DESC, rl.id DESC`
            : `ORDER BY COALESCE(rz.zoho_last_modified_time, rl.created_at::text) DESC, rl.id DESC`;
  // ?sort=priority: source-platform rank first, recency second. Scoped to
  // view=scanned — the feed behind both Prioritize surfaces (triage Prioritize
  // tab + unbox Prioritize toggle). Deliberately NOT applied to activity/all:
  // those append unmatched-carton placeholders and re-sort in JS by recent
  // activity (below), which would silently override the priority order. scanned
  // skips both, so the SQL order is the final order. rs_agg isn't joined for
  // scanned, so the recency tiebreak uses the triage door stamp.
  if (wantsPrioritySort && view === 'scanned') {
    orderBy = `ORDER BY ${RECEIVING_PRIORITY_RANK_SQL} ASC, ${RECEIVING_LANE_RANK_SQL} ASC, rt.door_received_at::text DESC NULLS LAST, rl.id DESC`;
  }
  // The lateral aggregate is needed for view=all and view=activity so the
  // most recently paired cartons bubble up. Cheap at this scale.
  const recentScansJoin = view === 'all' || view === 'activity' || view === 'unbox_opened'
    ? `LEFT JOIN LATERAL (
            SELECT MAX(rs.scanned_at) AS last_scan
            FROM receiving_scans rs
            WHERE rs.receiving_id = r.id
         ) rs_agg ON TRUE`
    : '';
  // First-open axis for Unboxed rail + History `unboxed_newest` (same stamp the
  // sidebar ages/sorts on). ops MAX only fills legacy rows missing ru.opened_at.
  const unboxOpenedJoin =
    view === 'unbox_opened' || view === 'activity' || view === 'all'
    ? `LEFT JOIN LATERAL (
            SELECT MAX(oe_uo.occurred_at) AS unbox_opened_at
            FROM ops_events oe_uo
            WHERE oe_uo.organization_id = r.organization_id
              AND oe_uo.entity_type = 'receiving'
              AND oe_uo.entity_id = r.id
              AND oe_uo.event_type = 'UNBOX_SCAN_OPENED'
         ) unbox_open ON TRUE`
    : '';
  const unboxOpenedSelect =
    view === 'unbox_opened' || view === 'activity' || view === 'all'
    ? `, COALESCE(ru.opened_at, unbox_open.unbox_opened_at)::text AS unbox_opened_at`
    : '';

  // Fetch extra line rows when `view=all` so merged Zoho-less placeholders
  // can displace the tail of the list after sort (Recent + History share this).
  const lineFetchLimit = view === 'all' ? Math.min(limit + 200, 600) : limit;
  values.push(lineFetchLimit, offset);

  const lastScanSelect = view === 'all' || view === 'activity'
    ? `, rs_agg.last_scan::text AS last_scan_at`
    : '';

  // Testing-view verdict rollup: latest verdict time + verdict count per line,
  // scoped to the tester when one is supplied. The feed is sorted by
  // rl.updated_at (the per-verdict line bump), so surfacing tested_at lets the
  // rail render a timestamp that matches that order instead of the unrelated
  // receiving/scan time; tested_count drives the "tested k/N" quantity.
  // testerId is a validated finite integer (>0) so it's safe to inline as a
  // literal — this keeps the count query's positional params unchanged.
  const scopeTester = view === 'testing' && Number.isFinite(testerId) && testerId > 0;
  const testingOpenedScope =
    view === 'testing_opened' && Number.isFinite(viewerStaffId) && viewerStaffId > 0;
  const testedAggSelect =
    view === 'testing' || view === 'testing_opened'
      ? `, tr_agg.tested_at::text AS tested_at, tr_agg.tested_count::int AS tested_count`
      : '';
  // Needs-test (testing to-do) sort axis: surface the same received-time the
  // feed is ordered by so the rail renders "received Xm ago" matching the sort
  // order (mapRow folds needs_test_at into last_activity_at first).
  const needsTestSelect = view === 'needs-test'
    ? `, COALESCE(ru.unboxed_at, rt.door_received_at, rl.updated_at, rl.created_at)::text AS needs_test_at`
    : '';
  const testedAggJoin = view === 'testing'
    ? weekStart && weekEnd
      ? `INNER JOIN (
            SELECT tr.receiving_line_id,
                   MAX(tr.created_at) AS tested_at,
                   COUNT(*) AS tested_count
            FROM testing_results tr
            WHERE TRUE
              ${testingTesterParamIdx ? `AND tr.tested_by = $${testingTesterParamIdx}` : ''}
              AND tr.created_at >= ($${testingWeekStartParamIdx}::date AT TIME ZONE 'America/Los_Angeles')
              AND tr.created_at < (($${testingWeekEndParamIdx}::date + 1) AT TIME ZONE 'America/Los_Angeles')
            GROUP BY tr.receiving_line_id
         ) tr_agg ON tr_agg.receiving_line_id = rl.id`
      : `LEFT JOIN LATERAL (
            SELECT MAX(tr.created_at) AS tested_at, COUNT(*) AS tested_count
            FROM testing_results tr
            WHERE tr.receiving_line_id = rl.id
              ${scopeTester ? `AND tr.tested_by = ${Math.trunc(testerId)}` : ''}
         ) tr_agg ON TRUE`
    : view === 'testing_opened'
      ? `LEFT JOIN LATERAL (
            SELECT MAX(tr.created_at) AS tested_at, COUNT(*) AS tested_count
            FROM testing_results tr
            WHERE tr.receiving_line_id = rl.id
              ${testingOpenedScope ? `AND tr.tested_by = ${Math.trunc(viewerStaffId)}` : ''}
         ) tr_agg ON TRUE`
    : '';

  // Incoming-only extras: derived delivery_state bucket + expected_delivery_date
  // from zoho_po_mirror. delivery_state is computed on read (CQRS-style) so a
  // carrier status flip (IN_TRANSIT → DELIVERED) shows the right bucket on
  // the next page load with no sync write. zoho_po_mirror JOIN is constrained
  // by the unique zoho_purchaseorder_id key so it stays 1:1.
  const incomingExtrasSelect =
    view === 'incoming'
      ? `,
                CASE
                  WHEN COALESCE(rl.quantity_received, 0) > 0 OR rl.workflow_status <> 'EXPECTED'
                    THEN 'RECEIVED'
                  WHEN stn.is_delivered = true
                       AND NOT ${SHIPMENT_SCANNED_PREDICATE}
                    THEN 'DELIVERED_UNOPENED'
                  WHEN stn.is_delivered = true
                       AND ${SHIPMENT_SCANNED_PREDICATE}
                       AND COALESCE(rl.quantity_received, 0) = 0
                       AND ru.unboxed_at IS NULL
                       AND rl.workflow_status NOT IN (
                         'UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE','FAILED','RTV','SCRAP'
                       )
                    THEN 'DELIVERED_NOT_UNBOXED'
                  WHEN stn.latest_status_category = 'OUT_FOR_DELIVERY'
                    THEN 'ARRIVING_TODAY'
                  WHEN stn.id IS NOT NULL
                       AND COALESCE(stn.is_terminal, false) = false
                       AND COALESCE(stn.is_delivered, false) = false
                       AND (
                         stn.has_exception = true
                         OR (stn.latest_event_at IS NOT NULL
                             AND stn.latest_event_at < (NOW() - interval '72 hours'))
                       )
                    THEN 'STALLED'
                  WHEN stn.tracking_blocked_reason IS NOT NULL
                       AND COALESCE(stn.is_delivered, false) = false
                    THEN 'TRACKING_UNAVAILABLE'
                  WHEN stn.latest_status_category IN ('IN_TRANSIT','ACCEPTED','LABEL_CREATED')
                    THEN 'IN_TRANSIT'
                  WHEN stn.id IS NULL
                    THEN 'AWAITING_TRACKING'
                  -- Carrier/number don't match: no known carrier for the number,
                  -- or the carrier API has no record of it. Peeled out of
                  -- PENDING_CARRIER (below) because these never self-resolve.
                  WHEN ${CARRIER_MISMATCH_PREDICATE}
                    THEN 'CARRIER_MISMATCH'
                  WHEN stn.latest_status_category IS NULL OR stn.latest_status_category = 'UNKNOWN'
                    THEN 'PENDING_CARRIER'
                  ELSE 'UNKNOWN'
                END AS delivery_state,
                stn.tracking_blocked_reason          AS shipment_blocked_reason,
                stn.has_exception                    AS shipment_has_exception,
                stn.latest_event_at::text            AS shipment_latest_event_at,
                stn.last_checked_at::text            AS shipment_last_checked_at,
                stn.is_terminal                      AS shipment_is_terminal,
                stn_evt.event_city                   AS shipment_latest_event_city,
                stn_evt.event_postal_code            AS shipment_latest_event_postal,
                mirror.po_date::text                 AS po_date,
                mirror.expected_delivery_date::text  AS expected_delivery_date,
                mirror.vendor_name::text             AS vendor_name`
      : '';
  // Phase 2: surface the Zoho PO mirror status so the UI can badge a
  // physically-present box whose PO Zoho already marks received/closed
  // (instead of the row silently disappearing). Available wherever the
  // zoho_po_mirror JOIN runs (incoming + scanned + the unbox activity rail).
  // The activity rail needs it so a line whose PO Zoho already received reads
  // "Received" (green) instead of falling back to its local unbox-pipeline
  // workflow_status — see getReceivingStatusDot.
  // Unbox rail (unbox_opened) + History (activity/all) need mirror status so
  // coarse paint / Received meters flip after Inventory Refresh without waiting
  // on a live Zoho round-trip — same wire as ?id= / ?receiving_id=.
  const needsZohoMirror =
    view === 'incoming'
    || view === 'incoming_removed'
    || view === 'scanned'
    || view === 'activity'
    || view === 'all'
    || view === 'unbox_opened';
  const zohoStatusSelect = needsZohoMirror
    ? `, mirror.status AS zoho_status, mirror.last_synced_at::text AS zoho_status_synced_at`
    : '';
  /**
   * The two removal signals the row shape does not already carry.
   *
   * The other four (`delivered` · `scanned` · `unboxed` · vendor status) are
   * already normalized fields, so the client resolves them from the row it has;
   * these two would otherwise need a second round trip. Precedence is NOT
   * computed here — `resolveIncomingRemovalReason` owns that, and a `CASE` in
   * this SELECT would be the second ladder the registry exists to prevent.
   */
  const removedSignalsSelect =
    view === 'incoming_removed'
      ? `,
                EXISTS (
                  SELECT 1 FROM receiving_exceptions rx_sel
                   WHERE rx_sel.organization_id = rl.organization_id
                     AND rx_sel.receiving_line_id = rl.id
                     AND rx_sel.status = 'OPEN'
                     AND rx_sel.exception_code IN ('LOST_IN_TRANSIT','EMPTY_BOX','MISDELIVERED','STOLEN')
                )                                    AS removed_written_off,
                (
                  COALESCE(stn.is_delivered, false) = true
                  AND NOT ${SHIPMENT_SCANNED_PREDICATE}
                  AND stn.delivered_at < NOW() - interval '${DELIVERED_UNSCANNED_WINDOW_DAYS} days'
                )                                    AS removed_aged_out,
                -- When the row left, as best the evidence allows. GREATEST skips
                -- NULLs, so each arm contributes only when its exit applies. The
                -- vendor arm is the poll time, never a transition time.
                GREATEST(
                  ru.unboxed_at,
                  rt.door_received_at,
                  CASE WHEN COALESCE(rl.quantity_received, 0) > 0 THEN rl.updated_at END,
                  CASE WHEN NOT ${NOT_ZOHO_RECEIVED_PREDICATE} THEN mirror.last_synced_at END,
                  CASE
                    WHEN COALESCE(stn.is_delivered, false) = true
                     AND NOT ${SHIPMENT_SCANNED_PREDICATE}
                    THEN stn.delivered_at + interval '${DELIVERED_UNSCANNED_WINDOW_DAYS} days'
                  END
                )::text                              AS removed_at`
      : '';
  // view=viewed only: surface the viewer's own viewed_at so the rail labels
  // each row with "when you opened it" (mapRow folds it into last_activity_at)
  // instead of the unrelated scan/line time.
  const viewedAtSelect =
    view === 'viewed' && viewedParamIdx > 0
      ? `, (SELECT v.viewed_at FROM receiving_line_views v
               WHERE v.receiving_line_id = rl.id AND v.staff_id = $${viewedParamIdx})::text AS viewed_at`
      : view === 'testing_opened' && viewedParamIdx > 0
        ? `, (SELECT o.opened_at FROM receiving_line_testing_opens o
               WHERE o.receiving_line_id = rl.id AND o.staff_id = $${viewedParamIdx})::text AS testing_opened_at`
      : '';
  const incomingExtrasJoin = needsZohoMirror
    ? `LEFT JOIN zoho_po_mirror mirror ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
       LEFT JOIN LATERAL (
         SELECT e.event_city, e.event_postal_code
           FROM shipment_tracking_events e
          WHERE e.shipment_id = stn.id
          ORDER BY e.event_occurred_at DESC NULLS LAST, e.id DESC
          LIMIT 1
       ) stn_evt ON TRUE`
    : '';
  // Universal Incoming: resolve the buyer/storefront account's human label for
  // the source chip (plan §6.3). rl.platform_account_id is stamped by
  // ingestPurchase on an eBay purchase line; join the org catalog 1:1 to turn
  // it into a display label. Incoming-only; NULL for plain Zoho lines.
  const platformAccountJoin =
    view === 'incoming'
      ? `LEFT JOIN platform_accounts pa_inbound
             ON pa_inbound.id = rl.platform_account_id
            AND pa_inbound.organization_id = rl.organization_id`
      : '';
  const platformAccountSelect =
    view === 'incoming'
      ? `, COALESCE(pa_inbound.label, pa_inbound.integration_scope) AS platform_account_label`
      : '';

  const listSql =
    `SELECT rl.*,
                -- Wave-2 street cutover: moved line-cluster columns are read
                -- from their 1:1 street tables (receiving_line_testing rlt /
                -- receiving_line_zoho rz); the duplicate output names override
                -- the rl.* spine values (last column wins in pg row objects).
                COALESCE(rlt.needs_test, false)              AS needs_test,
                rlt.assigned_tech_id                         AS assigned_tech_id,
                rlt.qa_status                                AS qa_status,
                rlt.disposition_code                         AS disposition_code,
                rlt.condition_grade                          AS condition_grade,
                rlt.disposition_final                        AS disposition_final,
                COALESCE(rlt.disposition_audit, '[]'::jsonb) AS disposition_audit,
                rlt.condition_set_at                         AS condition_set_at,
                rlt.condition_graded_at::text                         AS condition_graded_at,
                ru.contents_confirmed_at::text                         AS contents_confirmed_at,
                rlt.label_printed_at                         AS label_printed_at,
                rlt.label_previewed_at::text                       AS label_previewed_at,
                ${PUTAWAY_STAGED_SELECT_SQL},
                COALESCE(rlt.serial_absent, false)           AS serial_absent,
                rlt.serial_absent_reason                     AS serial_absent_reason,
                COALESCE(rlt.serial_projection, '[]'::jsonb)   AS serials,
                rz.zoho_item_id                              AS zoho_item_id,
                rz.zoho_line_item_id                         AS zoho_line_item_id,
                rz.zoho_purchase_receive_id                  AS zoho_purchase_receive_id,
                rz.zoho_purchaseorder_id                     AS zoho_purchaseorder_id,
                rz.zoho_purchaseorder_number                 AS zoho_purchaseorder_number,
                rz.zoho_purchaseorder_number_norm            AS zoho_purchaseorder_number_norm,
                rz.zoho_sync_source                          AS zoho_sync_source,
                rz.zoho_last_modified_time                   AS zoho_last_modified_time,
                rz.zoho_synced_at                            AS zoho_synced_at,
                rz.zoho_notes                                AS zoho_notes,
                rz.unit_price                                AS unit_price,
                stn.tracking_number_raw AS receiving_tracking_number,
                r.carrier,
                rt.door_received_at::text          AS receiving_received_at,
                ru.unboxed_at::text           AS receiving_unboxed_at,
                rt.door_received_by                AS receiving_received_by,
                ru.unboxed_by                 AS receiving_unboxed_by,
                staff_rb.name                AS received_by_name,
                staff_ub.name                AS unboxed_by_name,
                -- first_scanned_at is the genuine door/tracking scan ONLY. It feeds
                -- the "Scanned" display (row.scanned_at → tracking_scanned_at), which
                -- is triage-owned — never fold unbox_opened_at in here or opening a
                -- carton in Unbox would visibly bump "Scanned". The unbox-open time is
                -- returned separately as unbox_opened_at (line ~1090) for the unbox rail.
                COALESCE(ops_scan.first_scanned_at, scan_first.scanned_at)::text  AS first_scanned_at,
                scan_first.scanned_by        AS first_scanned_by,
                staff_sb.name                AS scanned_by_name,
                r.source                     AS receiving_source,
                r.source_platform            AS receiving_source_platform,
                r.intake_type                AS receiving_intake_type,
                COALESCE(r.is_priority, false) AS is_priority,
                r.priority_tier                AS priority_tier,
                COALESCE(rt.triage_complete, false) AS triage_complete,
                rt.triage_completed_at::text    AS triage_completed_at,
                COALESCE(ru.intake_path = 'unbox_only', false) AS unbox_only_intake,
                rt.staging_location_id,
                ${STAGING_LOCATION_LABEL_SQL},
                rt.priority_lane,
                rt.pairing_state,
                r.zoho_purchaseorder_number  AS receiving_zoho_purchaseorder_number,
                r.support_notes              AS receiving_support_notes,
                r.zoho_notes                 AS receiving_zoho_notes,
                r.listing_url                AS receiving_listing_url,
                stn.tracking_number_raw      AS shipment_tracking_number,
                stn.carrier                  AS shipment_carrier,
                stn.latest_status_category   AS shipment_status_category,
                stn.is_delivered             AS shipment_is_delivered,
                stn.delivered_at             AS shipment_delivered_at,
                ${RECEIVING_LINE_IMAGE_URL_SQL},
                sc.product_title             AS catalog_product_title,
                -- Zoho item title (canonical SoT). Always preferred for display
                -- over the PO line's listing-style item_name and over the
                -- marketplace catalog title — the Zoho SKU's own title governs.
                (SELECT name FROM items
                  WHERE zoho_item_id = rz.zoho_item_id AND status = 'active'
                  LIMIT 1)                   AS zoho_item_title,
                sc.id                        AS sku_catalog_id,
                ${sqlReceivingPhotoCount('rl.receiving_id', 'rl.organization_id')} AS photo_count,
                -- ticket_links (authoritative) → denormalized columns fallback.
                ${sqlReceivingZendeskTicketColumn()}
                ${lastScanSelect}
                ${testedAggSelect}
                ${needsTestSelect}
                ${incomingExtrasSelect}
                ${zohoStatusSelect}${removedSignalsSelect}
                ${platformAccountSelect}
                ${viewedAtSelect}
                ${unboxOpenedSelect}
         FROM receiving_line rl
         LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
         LEFT JOIN receiving_line_zoho rz     ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         ${PUTAWAY_STAGED_JOIN_SQL}
         -- Soft JOIN: direct FK when set, else PO#-based fallback (see note above).
         -- D1 wrong-shipment guard: a direct receiving FK, else a PO#-based
         -- fallback. When a line has no FK and its PO has multiple zoho_po
         -- receiving rows, the old ON-clause matched them all (row
         -- multiplication / arbitrary shipment). LATERAL + LIMIT 1 picks exactly
         -- one, deterministically: direct FK wins, else prefer a row that
         -- actually carries a shipment, else the newest.
         LEFT JOIN LATERAL (
           SELECT r.* FROM receiving_carton r
            WHERE r.organization_id = rl.organization_id
              AND (r.id = rl.receiving_id
               OR (rl.receiving_id IS NULL
                   AND r.source = 'zoho_po'
                   AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id)
               OR (rl.receiving_id IS NULL
                   AND ${INBOUND_MARKETPLACE_CARTON_SOURCES_SQL}
                   AND r.source_order_id = rl.source_order_id
                   AND r.organization_id = rl.organization_id))
            ORDER BY (r.id = rl.receiving_id) DESC,
                     (r.shipment_id IS NOT NULL) DESC,
                     r.id DESC
            LIMIT 1
         ) r ON TRUE
         ${sqlLinkedSupportTicketLateralJoin()}
         LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
         ${STAGING_LOCATION_JOIN_SQL}
         LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
         -- SKU IDENTITY LAW — exact + org-scoped (src/lib/sku/sku-identity-law.ts).
         LEFT JOIN sku_catalog sc                ON ${SKU_CATALOG_JOIN_ON_SQL}
         LEFT JOIN staff staff_rb                ON staff_rb.id = rt.door_received_by
         LEFT JOIN staff staff_ub                ON staff_ub.id = ru.unboxed_by
         LEFT JOIN LATERAL (
           SELECT rs.scanned_at, rs.scanned_by
           FROM receiving_scans rs
           WHERE rs.receiving_id = r.id
           ORDER BY rs.scanned_at ASC NULLS LAST, rs.id ASC
           LIMIT 1
         ) scan_first ON TRUE
         LEFT JOIN LATERAL (
           SELECT
             MIN(oe.occurred_at) AS first_scanned_at,
             MAX(oe.occurred_at) AS last_scanned_at
           FROM ops_events oe
           WHERE oe.organization_id = rl.organization_id
             AND oe.entity_type = 'receiving'
             AND oe.entity_id = r.id
             AND oe.event_type = 'TRACKING_SCANNED'
         ) ops_scan ON TRUE
         LEFT JOIN staff staff_sb                ON staff_sb.id = scan_first.scanned_by
         ${recentScansJoin}
         ${unboxOpenedJoin}
         ${testedAggJoin}
         ${incomingExtrasJoin}
         ${platformAccountJoin}
         ${where}
         ${orderBy}
         LIMIT $${idx} OFFSET $${idx + 1}`;

  const countSql =
    `SELECT COUNT(*) AS total FROM receiving_line rl
         LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
         LEFT JOIN receiving_line_zoho rz     ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         -- D1 wrong-shipment guard: a direct receiving FK, else a PO#-based
         -- fallback. When a line has no FK and its PO has multiple zoho_po
         -- receiving rows, the old ON-clause matched them all (row
         -- multiplication / arbitrary shipment). LATERAL + LIMIT 1 picks exactly
         -- one, deterministically: direct FK wins, else prefer a row that
         -- actually carries a shipment, else the newest.
         LEFT JOIN LATERAL (
           SELECT r.* FROM receiving_carton r
            WHERE r.organization_id = rl.organization_id
              AND (r.id = rl.receiving_id
               OR (rl.receiving_id IS NULL
                   AND r.source = 'zoho_po'
                   AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id)
               OR (rl.receiving_id IS NULL
                   AND ${INBOUND_MARKETPLACE_CARTON_SOURCES_SQL}
                   AND r.source_order_id = rl.source_order_id
                   AND r.organization_id = rl.organization_id))
            ORDER BY (r.id = rl.receiving_id) DESC,
                     (r.shipment_id IS NOT NULL) DESC,
                     r.id DESC
            LIMIT 1
         ) r ON TRUE
         LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
         LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id${weekStart && weekEnd ? `\n         ${testedAggJoin}` : ''}
         ${incomingExtrasJoin}
         ${where}`;

  return {
    list: { sql: listSql, params: values },
    count: { sql: countSql, params: values.slice(0, -2) },
  };
}

/**
 * Unmatched/unfound cartons live in the `receiving` table with no
 * `receiving_line` row yet, so they never come back from the main query.
 * They're appended as placeholder rows for `all` AND `activity`. For
 * `activity` (Unbox History) with no search, only Unbox-touched lineless
 * cartons qualify — door-scan-only Unfound stays in Unfound / triage feeds,
 * not History. An active History search (same rationale as skipWeekFilter)
 * widens to lineless `zoho_po` cartons and drops the Unbox-touch gate so a
 * tracking / PO lookup can resolve a ghost PO package that has an STN but no
 * lines yet. `all` stays inclusive for search / resolution.
 */
export function shouldIncludeUnmatchedPlaceholders(query: ReceivingLinesQuery): boolean {
  return (
    (query.view === 'all' || query.view === 'activity') &&
    query.searchScope !== 'zoho_po' &&
    !receivingHistorySkipsUnmatchedPlaceholders(query.searchField)
  );
}

/**
 * History (`view=activity`) membership for lineless unmatched placeholders:
 * opened or unboxed on the Unbox surface — mirrors when a placeholder would
 * render as non-SCANNED (see buildUnmatchedEmptyReceivingLine). Skipped when
 * the operator is actively searching (see {@link buildUnmatchedPlaceholdersSql}).
 */
const ACTIVITY_UNMATCHED_UNBOX_TOUCH_SQL = ` AND (
              ru.unboxed_at IS NOT NULL
              OR ru.opened_at IS NOT NULL
              OR unbox_open.unbox_opened_at IS NOT NULL
            )`;

/** Placeholder rows + count for lineless unmatched/local-pickup/(search) zoho_po cartons. */
export function buildUnmatchedPlaceholdersSql(
  query: ReceivingLinesQuery,
  orgId: string,
): BuiltListSql {
  const { search, searchField } = query;
  // $1 is reserved for orgId (these placeholder queries run on `receiving`,
  // which is org-owned); the optional search pattern becomes $2.
  const unmatchedSearchVals: unknown[] = [orgId];
  let unmatchedSearchSql = '';
  if (search) {
    unmatchedSearchVals.push(`%${search}%`);
    if (searchField === 'po') {
      unmatchedSearchSql =
        ` AND COALESCE(r.zoho_purchaseorder_number, '') ILIKE $2`;
    } else if (searchField === 'tracking') {
      unmatchedSearchSql = ` AND (
               COALESCE(stn.tracking_number_raw, '') ILIKE $2
            OR COALESCE(stn.tracking_number_raw, '') ILIKE $2
            OR COALESCE(stn.tracking_number_normalized, '') ILIKE $2
          )`;
    } else {
      unmatchedSearchSql = ` AND (
               COALESCE(stn.tracking_number_raw, '') ILIKE $2
            OR COALESCE(stn.tracking_number_raw, '') ILIKE $2
            OR COALESCE(stn.tracking_number_normalized, '') ILIKE $2
            OR COALESCE(r.zoho_purchaseorder_number, '') ILIKE $2
          )`;
    }
  }
  // Browse History stays Unfound/local-pickup + Unbox-touched. An armed search
  // must also resolve lineless Zoho PO cartons (STN stamped, lines not yet
  // materialized — eBay→Zoho ghost packages) and must not hide them behind the
  // Unbox-touch gate — same "search outranks browse membership" rule as
  // skipWeekFilter on the History mode descriptor.
  const searchActive = Boolean(search);
  const sourceInSql = searchActive
    ? `('unmatched', 'local_pickup', 'zoho_po')`
    : `('unmatched', 'local_pickup')`;
  const activityGatesMembership = query.view === 'activity' && !searchActive;
  const activityUnboxTouchSql = activityGatesMembership
    ? ACTIVITY_UNMATCHED_UNBOX_TOUCH_SQL
    : '';
  // Count needs the same unbox joins when History gates membership.
  const countUnboxJoinsSql = activityGatesMembership
    ? `
             LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
             LEFT JOIN LATERAL (
               SELECT MAX(oe_uo.occurred_at) AS unbox_opened_at
               FROM ops_events oe_uo
               WHERE oe_uo.organization_id = r.organization_id
                 AND oe_uo.entity_type = 'receiving'
                 AND oe_uo.entity_id = r.id
                 AND oe_uo.event_type = 'UNBOX_SCAN_OPENED'
             ) unbox_open ON TRUE`
    : '';

  return {
    list: {
      sql:
        `SELECT r.id,
                  stn.tracking_number_raw AS receiving_tracking_number,
                  r.carrier,
                  rt.door_received_at::text          AS receiving_received_at,
                  ru.unboxed_at::text           AS receiving_unboxed_at,
                  r.created_at::text           AS created_at,
                  r.support_notes              AS receiving_support_notes,
                  r.zoho_notes                 AS receiving_zoho_notes,
                  r.listing_url                AS receiving_listing_url,
                  r.source_platform            AS receiving_source_platform,
                r.intake_type                AS receiving_intake_type,
                  r.source                     AS receiving_source,
                  COALESCE(r.is_priority, false) AS is_priority,
                r.priority_tier                AS priority_tier,
                  r.zoho_purchaseorder_number  AS receiving_zoho_purchaseorder_number,
                  r.source_order_id            AS receiving_source_order_id,
                  stn.tracking_number_raw      AS shipment_tracking_number,
                  stn.carrier                  AS shipment_carrier,
                  stn.latest_status_category   AS shipment_status_category,
                  stn.is_delivered             AS shipment_is_delivered,
                  stn.delivered_at::text       AS shipment_delivered_at,
                  COALESCE(ops_scan.first_scanned_at, scan_first.scanned_at)::text  AS first_scanned_at,
                  COALESCE(ops_scan.last_scanned_at, rs_agg.last_scan)::text       AS last_scan_at,
                  COALESCE(ru.opened_at::text, unbox_open.unbox_opened_at::text) AS unbox_opened_at,
                ${sqlReceivingPhotoCount('r.id', 'r.organization_id')} AS photo_count,
                ${sqlReceivingCartonZendeskTicketColumn()}
           FROM receiving_carton r
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
           ${sqlCartonLinkedSupportTicketLateralJoin()}
           LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
           LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
           LEFT JOIN LATERAL (
               SELECT rs.scanned_at, rs.scanned_by
               FROM receiving_scans rs
               WHERE rs.receiving_id = r.id
               ORDER BY rs.scanned_at ASC NULLS LAST, rs.id ASC
               LIMIT 1
           ) scan_first ON TRUE
           LEFT JOIN LATERAL (
               SELECT
                 MIN(oe.occurred_at) AS first_scanned_at,
                 MAX(oe.occurred_at) AS last_scanned_at
               FROM ops_events oe
               WHERE oe.organization_id = r.organization_id
                 AND oe.entity_type = 'receiving'
                 AND oe.entity_id = r.id
                 AND oe.event_type = 'TRACKING_SCANNED'
           ) ops_scan ON TRUE
           LEFT JOIN LATERAL (
               SELECT MAX(rs.scanned_at) AS last_scan
               FROM receiving_scans rs
               WHERE rs.receiving_id = r.id
            ) rs_agg ON TRUE
           LEFT JOIN LATERAL (
               SELECT MAX(oe_uo.occurred_at) AS unbox_opened_at
               FROM ops_events oe_uo
               WHERE oe_uo.organization_id = r.organization_id
                 AND oe_uo.entity_type = 'receiving'
                 AND oe_uo.entity_id = r.id
                 AND oe_uo.event_type = 'UNBOX_SCAN_OPENED'
           ) unbox_open ON TRUE
           WHERE r.organization_id = $1
             AND r.source IN ${sourceInSql}
             AND NOT EXISTS (
               SELECT 1 FROM receiving_line rl
                WHERE rl.receiving_id = r.id
                  AND rl.organization_id = r.organization_id
             )
             ${unmatchedSearchSql}${activityUnboxTouchSql}
           ORDER BY COALESCE(rs_agg.last_scan::text, rt.door_received_at::text, r.created_at::text) DESC NULLS LAST,
                    r.id DESC
           LIMIT 150`,
      params: unmatchedSearchVals,
    },
    count: {
      sql:
        `SELECT COUNT(*)::bigint AS n
             FROM receiving_carton r
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id${countUnboxJoinsSql}
            WHERE r.organization_id = $1
              AND r.source IN ${sourceInSql}
              AND NOT EXISTS (
                SELECT 1 FROM receiving_line rl
                 WHERE rl.receiving_id = r.id
                   AND rl.organization_id = r.organization_id
              )
              ${unmatchedSearchSql}${activityUnboxTouchSql}`,
      params: unmatchedSearchVals,
    },
  };
}

/**
 * Lineless cartons opened on the Unbox surface (any source — incl. ghost
 * zoho_po rows after the operator typed a PO#) never appear in the lines
 * query; they're appended as placeholders keyed on UNBOX_SCAN_OPENED.
 */
export function shouldIncludeUnboxOpenedPlaceholders(query: ReceivingLinesQuery): boolean {
  return (
    query.view === 'unbox_opened' &&
    query.searchScope !== 'zoho_po' &&
    !receivingHistorySkipsUnmatchedPlaceholders(query.searchField)
  );
}

/** Placeholder rows + count for lineless cartons opened on the Unbox surface. */
export function buildUnboxOpenedPlaceholdersSql(
  query: ReceivingLinesQuery,
  orgId: string,
  // Column-only membership when the rail read flag is on — must match the main
  // list query's predicate so a carton is in exactly one of (lined, placeholder).
  // Defaults false so the flag-off SQL stays byte-identical (build-sql.test.ts).
  unboxRailColumnRead = false,
): BuiltListSql {
  const unboxOpenedPredicate = unboxOpenedPredicateSql(unboxRailColumnRead);
  const { search, searchField, receivingIdIn } = query;
  const unboxSearchVals: unknown[] = [orgId];
  let unboxSearchSql = '';
  // Same pre-limit as the main list: when the caller has already ranked the
  // cartons, the placeholder scan is restricted to that page instead of walking
  // every unbox-opened carton in the org. Appended AFTER the search param so
  // the no-param SQL keeps its `$1`/`$2` numbering byte-for-byte.
  const receivingIdInSql =
    receivingIdIn.length > 0
      ? ` AND r.id = ANY($${search ? 3 : 2}::int[])`
      : '';
  if (search) {
    unboxSearchVals.push(`%${search}%`);
    if (searchField === 'po') {
      unboxSearchSql = ` AND COALESCE(r.zoho_purchaseorder_number, '') ILIKE $2`;
    } else if (searchField === 'tracking') {
      unboxSearchSql = ` AND (
               COALESCE(stn.tracking_number_raw, '') ILIKE $2
            OR COALESCE(stn.tracking_number_normalized, '') ILIKE $2
          )`;
    } else {
      unboxSearchSql = ` AND (
               COALESCE(stn.tracking_number_raw, '') ILIKE $2
            OR COALESCE(stn.tracking_number_normalized, '') ILIKE $2
            OR COALESCE(r.zoho_purchaseorder_number, '') ILIKE $2
          )`;
    }
  }
  // Pushed last so it lands on $3 when a search param already took $2.
  if (receivingIdIn.length > 0) unboxSearchVals.push(receivingIdIn);

  return {
    list: {
      sql:
        `SELECT r.id,
                  stn.tracking_number_raw AS receiving_tracking_number,
                  r.carrier,
                  rt.door_received_at::text          AS receiving_received_at,
                  ru.unboxed_at::text           AS receiving_unboxed_at,
                  r.created_at::text           AS created_at,
                  r.support_notes              AS receiving_support_notes,
                  r.zoho_notes                 AS receiving_zoho_notes,
                  r.listing_url                AS receiving_listing_url,
                  r.source_platform            AS receiving_source_platform,
                  r.intake_type                AS receiving_intake_type,
                  r.source                     AS receiving_source,
                  COALESCE(r.is_priority, false) AS is_priority,
                  r.priority_tier                AS priority_tier,
                  r.zoho_purchaseorder_number  AS receiving_zoho_purchaseorder_number,
                  r.source_order_id            AS receiving_source_order_id,
                  stn.tracking_number_raw      AS shipment_tracking_number,
                  stn.carrier                  AS shipment_carrier,
                  stn.latest_status_category   AS shipment_status_category,
                  stn.is_delivered             AS shipment_is_delivered,
                  stn.delivered_at::text       AS shipment_delivered_at,
                  COALESCE(ops_scan.first_scanned_at, scan_first.scanned_at)::text  AS first_scanned_at,
                  COALESCE(ru.opened_at::text, unbox_open.unbox_opened_at::text) AS unbox_opened_at,
                  ${sqlReceivingPhotoCount('r.id', 'r.organization_id')} AS photo_count,
                  ${sqlReceivingCartonZendeskTicketColumn()}
           FROM receiving_carton r
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
           ${sqlCartonLinkedSupportTicketLateralJoin()}
           LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
           LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
           LEFT JOIN LATERAL (
               SELECT rs.scanned_at, rs.scanned_by
               FROM receiving_scans rs
               WHERE rs.receiving_id = r.id
               ORDER BY rs.scanned_at ASC NULLS LAST, rs.id ASC
               LIMIT 1
           ) scan_first ON TRUE
           LEFT JOIN LATERAL (
               SELECT
                 MIN(oe.occurred_at) AS first_scanned_at,
                 MAX(oe.occurred_at) AS last_scanned_at
               FROM ops_events oe
               WHERE oe.organization_id = r.organization_id
                 AND oe.entity_type = 'receiving'
                 AND oe.entity_id = r.id
                 AND oe.event_type = 'TRACKING_SCANNED'
           ) ops_scan ON TRUE
           LEFT JOIN LATERAL (
               SELECT MAX(oe_uo.occurred_at) AS unbox_opened_at
               FROM ops_events oe_uo
               WHERE oe_uo.organization_id = r.organization_id
                 AND oe_uo.entity_type = 'receiving'
                 AND oe_uo.entity_id = r.id
                 AND oe_uo.event_type = 'UNBOX_SCAN_OPENED'
           ) unbox_open ON TRUE
           WHERE r.organization_id = $1
             AND ${unboxOpenedPredicate}
             AND NOT EXISTS (
               SELECT 1 FROM receiving_line rl
                WHERE rl.receiving_id = r.id
                  AND rl.organization_id = r.organization_id
             )
             AND NOT EXISTS (
               SELECT 1 FROM unfound_overlay uo
                WHERE uo.organization_id = r.organization_id
                  AND uo.source_kind = 'unmatched_receiving'
                  AND uo.source_id = r.id::text
                  AND uo.checked IS TRUE
             )
             ${unboxSearchSql}${receivingIdInSql}
           ORDER BY COALESCE(ru.opened_at::text, unbox_open.unbox_opened_at::text) DESC NULLS LAST,
                    r.id DESC
           LIMIT 150`,
      params: unboxSearchVals,
    },
    count: {
      sql:
        `SELECT COUNT(*)::bigint AS n
             FROM receiving_carton r
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
             LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
            WHERE r.organization_id = $1
              AND ${unboxOpenedPredicate}
              AND NOT EXISTS (
                SELECT 1 FROM receiving_line rl
                 WHERE rl.receiving_id = r.id
                   AND rl.organization_id = r.organization_id
              )
              AND NOT EXISTS (
                SELECT 1 FROM unfound_overlay uo
                 WHERE uo.organization_id = r.organization_id
                   AND uo.source_kind = 'unmatched_receiving'
                   AND uo.source_id = r.id::text
                   AND uo.checked IS TRUE
              )
              ${unboxSearchSql}${receivingIdInSql}`,
      params: unboxSearchVals,
    },
  };
}
