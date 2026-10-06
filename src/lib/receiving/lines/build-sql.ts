/** SQL builders for GET /api/receiving-lines (and its testing twin). */
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
import { RECEIVING_LINE_LISTING_EVIDENCE_SQL } from './sql-listing-evidence';
import {
  SHIPMENT_DELIVERY_ATTEMPTS_SQL,
  SHIPMENT_SIGNED_BY_SQL,
} from './sql-shipment-carrier-facts';
import {
  EXCEPTION_PO_LIVE_SQL,
  incomingExceptionCodeSql,
  incomingExceptionMembershipSql,
} from '@/lib/receiving/incoming-exceptions-sql';
import { normalizePostalCode } from '@/lib/receiving/wrong-destination';
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
interface BuiltSql {
  sql: string;
  params: unknown[];
}

/** A paged feed: the row query + its sibling COUNT query. */
interface BuiltListSql {
  list: BuiltSql;
  count: BuiltSql;
}

/** A serial (aliased `alias`) whose CURRENT receiving line — its most recent inventory_events touch, falling back to the frozen origin — is… */
function currentLineIsMatchSql(alias: string): string {
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

// Priority rank for the receiving "Prioritize" views (?sort=priority).
const RECEIVING_PRIORITY_RANK_SQL = priorityRankSql({
  tier: 'r.priority_tier',
  isPriority: 'r.is_priority',
  source: 'r.source',
  sourcePlatform: 'r.source_platform',
});

// Triage priority-lane tier (docs/receiving-triage-redesign-plan.md §4.2) — composes with RECEIVING_PRIORITY_RANK_SQL as a SECONDARY…
const RECEIVING_LANE_RANK_SQL = laneRankSql('rt.priority_lane');

/** The exits a row can take off the Incoming list, as SQL — one fragment per reason in the removal-reason registry, all inside the recency… */
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
                COALESCE(NULLIF(BTRIM(rl_ret.return_reason), ''), NULLIF(BTRIM(r.return_reason), '')) AS return_reason,
                rl_ret.rma_ref               AS return_rma_ref,
                rl_ret.source_order_id       AS return_source_order_id,
                rt.door_received_at::text          AS receiving_received_at,
                ru.unboxed_at::text           AS receiving_unboxed_at,
                rt.door_received_by                AS receiving_received_by,
                ru.unboxed_by                 AS receiving_unboxed_by,
                staff_rb.name                AS received_by_name,
                staff_ub.name                AS unboxed_by_name,
                staff_uo.name                AS unbox_opened_by_name,
                ru.opened_by                 AS receiving_unbox_opened_by,
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
                ${RECEIVING_LINE_LISTING_EVIDENCE_SQL},
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
         LEFT JOIN receiving_line_return rl_ret ON rl_ret.receiving_line_id = rl.id AND rl_ret.organization_id = rl.organization_id
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
         LEFT JOIN staff staff_uo                ON staff_uo.id = ru.opened_by
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
                  COALESCE(NULLIF(BTRIM(rl_ret.return_reason), ''), NULLIF(BTRIM(r.return_reason), '')) AS return_reason,
                  rl_ret.rma_ref               AS return_rma_ref,
                  rl_ret.source_order_id       AS return_source_order_id,
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
                  ${RECEIVING_LINE_LISTING_EVIDENCE_SQL},
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
           LEFT JOIN receiving_line_return rl_ret ON rl_ret.receiving_line_id = rl.id AND rl_ret.organization_id = rl.organization_id
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
interface ReceivingLinesListSqlInput {
  query: ReceivingLinesQuery;
  orgId: string;
  /** `Number(ctx?.staffId)` — raw; may be NaN. Drives view=viewed. */
  viewerStaffId: number;
  /** `await isIncomingUniversal(orgId)` when view=incoming, else false. */
  universalIncoming: boolean;
  /** `!isReceivingPhysicalStateFirst() || hideZohoReceived` (view=scanned). */
  applyScannedZohoExclusion: boolean;
  /** `isUnboxRailColumnRead()` — when true, `view=unbox_opened` membership reads ONLY the committed `receiving_unbox.opened_at` column… */
  unboxRailColumnRead?: boolean;
  /** Gate-before-decorate pre-limit for `view=scanned` (2026-08-27): */
  scannedLineIdIn?: readonly number[];
  /** The org's ship-from postal (`settings.shipFrom.postalCode`) — `view=exceptions` wrong-destination arm. */
  warehousePostal?: string;
}

/**
 * The Incoming walk order (`sort=urgency`, `incoming-sections.ts`): delivered →
 * arriving today → in transit → awaiting tracking → the rest. Reads `stn` only
 * — the lane already excludes scanned lines, so "delivered" here IS delivered
 * and not scanned, and no per-row EXISTS is paid to rank a page. Stalled and
 * blocked shipments rank with the rest, as the delivery_state CASE files them.
 */
const INCOMING_URGENCY_RANK_SQL = `(CASE
           WHEN COALESCE(rl.quantity_received, 0) > 0 OR rl.workflow_status <> 'EXPECTED' THEN 4
           WHEN COALESCE(stn.is_delivered, false) = true THEN 0
           WHEN stn.latest_status_category = 'OUT_FOR_DELIVERY' THEN 1
           WHEN stn.id IS NOT NULL
            AND COALESCE(stn.is_terminal, false) = false
            AND (stn.has_exception = true
                 OR (stn.latest_event_at IS NOT NULL AND stn.latest_event_at < (NOW() - interval '72 hours'))) THEN 4
           WHEN stn.tracking_blocked_reason IS NOT NULL THEN 4
           WHEN stn.latest_status_category IN ('IN_TRANSIT','ACCEPTED','LABEL_CREATED') THEN 2
           WHEN stn.id IS NULL THEN 3
           ELSE 4
         END)`;

/** `view=scanned` membership — door-scanned and physically in, but NOT yet unboxed: */
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

/** `view=activity` ("Unboxed") membership: the carton was opened on Unbox. A door-scan-only carton belongs to Deliveries › Docked instead. */
export const ACTIVITY_VIEW_PREDICATE_SQL = `(
           rl.workflow_status IN ('UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE')
           OR COALESCE(rl.quantity_received, 0) > 0
           OR ru.unboxed_at IS NOT NULL
         )
         AND (ru.unboxed_at IS NOT NULL OR ru.opened_at IS NOT NULL)`;

/**
 * `view=incoming` membership — on a PO (Zoho, or a marketplace purchase under
 * Universal Incoming), nothing received, no dock scan. `trackingInActive`
 * (pasted trackings) drops the vendor-received guards.
 */
export function incomingViewPredicateSql(universalIncoming: boolean, trackingInActive: boolean): string {
  if (!universalIncoming) {
    // Legacy Zoho-only Incoming (unchanged):
    return `rl.workflow_status = 'EXPECTED'
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
           AND NOT ${SHIPMENT_SCANNED_PREDICATE}`;
  }
  // Universal Incoming (plan §6.1):
  return `rl.workflow_status = 'EXPECTED'
           AND COALESCE(rl.quantity_received, 0) = 0
           AND (
             (rz.zoho_purchaseorder_id IS NOT NULL${trackingInActive ? '' : ` AND ${NOT_ZOHO_RECEIVED_PREDICATE}`})
             OR
             (rz.zoho_purchaseorder_id IS NULL
              AND ${INBOUND_MARKETPLACE_LINE_SOURCES_SQL}${trackingInActive ? '' : `
              AND ${notLineInboundMirrorTerminalPredicate()}`})
           )
           AND NOT ${SHIPMENT_SCANNED_PREDICATE}`;
}

/**
 * `view=exceptions` membership — Incoming's population (on a PO, nothing
 * received, no dock scan) EXCEPT the vendor-received guard, with an exception
 * code. `exceptionZipParam` binds the org's ship-from ZIP5, or null.
 */
export function exceptionsViewPredicateSql(universalIncoming: boolean, exceptionZipParam: string | null): string {
  return `rl.workflow_status = 'EXPECTED'
         AND COALESCE(rl.quantity_received, 0) = 0
         AND (
           (rz.zoho_purchaseorder_id IS NOT NULL AND ${EXCEPTION_PO_LIVE_SQL})${universalIncoming ? `
           OR (rz.zoho_purchaseorder_id IS NULL
               AND ${INBOUND_MARKETPLACE_LINE_SOURCES_SQL}
               AND ${notLineInboundMirrorTerminalPredicate()})` : ''}
         )
         AND ${incomingExceptionMembershipSql(exceptionZipParam)}`;
}

/** Gate-before-decorate candidate ranking for `view=scanned&sort=priority` — the /triage rail's cold-load shape. */
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

/** Upper-alnum — the same canonical form as `canonicalizeTrackingKey` and `*_number_norm`. */
const canonicalSql = (column: string) => `regexp_replace(upper(COALESCE(${column}, '')), '[^A-Z0-9]', '', 'g')`;

/**
 * A line some pasted `?ref_in=` key names — its tracking (indexed), its Zoho
 * PO number or id, its marketplace order id, or its carton's PO number.
 */
function lineRefMatchSql(param: string): string {
  return `(stn.tracking_number_normalized = ANY(${param}::text[])
           OR rz.zoho_purchaseorder_number_norm = ANY(${param}::text[])
           OR rz.zoho_purchaseorder_id::text = ANY(${param}::text[])
           OR ${canonicalSql('rl.source_order_id')} = ANY(${param}::text[])
           OR ${canonicalSql('r.zoho_purchaseorder_number')} = ANY(${param}::text[]))`;
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
    unboxQueueStage, unboxQueueLane, trackingIn, refIn, receivingIdIn,
  } = input.query;
  /** The operator named specific trackings, so this query is about THOSE ROWS — not about the lane's default population. */
  const trackingInActive = trackingIn.length > 0;
  /** `view=exceptions`: the warehouse ZIP5 as `$n`, or null when the org has none. */
  let exceptionZipParam: string | null = null;
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

  // Bulk tracking paste — INDEXED EQUALITY against the unique btree on `tracking_number_normalized`.
  if (trackingInActive) {
    conditions.push(`stn.tracking_number_normalized = ANY($${idx++}::text[])`);
    values.push(trackingIn);
  }

  // Unboxed (`view=activity`) under a pasted list: the lane's own population,
  // cut to the lines a pasted number names. (`view=reconcile` matches below, laneless.)
  if (view === 'activity' && refIn.length > 0) {
    conditions.push(lineRefMatchSql(`$${idx++}`));
    values.push(refIn);
  }

  // Pre-limit: restrict the candidate set to cartons named by the caller, which ranked them with a cheap read on the ordering column alone.
  if (receivingIdIn.length > 0) {
    conditions.push(`rl.receiving_id = ANY($${idx++}::int[])`);
    values.push(receivingIdIn);
  }

  // Gate-before-decorate pre-limit (view=scanned):
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
    // "Received" = physically in the warehouse.
    conditions.push(
      `rl.workflow_status IN ('MATCHED','UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE')`,
    );
  } else if (view === 'all') {
    // Union of recent + received, INCLUDING terminal fails (FAILED/RTV/ SCRAP) — "all" is the search/scan-resolution dataset, and excluding…
    conditions.push(
      `(rl.workflow_status IS NULL OR rl.workflow_status IN ('EXPECTED','ARRIVED','MATCHED','UNBOXED','AWAITING_TEST','IN_TEST','PASSED','FAILED','RTV','SCRAP','DONE'))`,
    );
  } else if (view === 'activity') {
    // "Activity" = Unboxed membership (ACTIVITY_VIEW_PREDICATE_SQL).
    conditions.push(ACTIVITY_VIEW_PREDICATE_SQL);
  } else if (view === 'scanned') {
    // "Scanned" = door-scanned and physically in, but NOT yet unboxed — the triage to-do between the door scan and the unbox step.
    conditions.push(scannedViewPredicateSql(unboxOpenedPredicate));
    // Phase 2: only hide Zoho-received POs when the physical-state-first flag is off OR the operator opted in via the "Hide Zoho-received"…
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
    // "Testing" = the recently-tested feed, backed by the testing_results log.
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
    // "Needs-test" = the testing TO-DO feed.
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
    // "Incoming" = on a Zoho PO, vendor has issued it, warehouse hasn't touched it yet.
    conditions.push(incomingViewPredicateSql(universalIncoming, trackingInActive));
    if (universalIncoming) {
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

    // A paste cut of THIS list. Unlike tracking_in, ref_in does not drop the
    // delivery_state facet — locate's awaiting-tracking bucket is that list.
    if (refIn.length > 0) {
      conditions.push(lineRefMatchSql(`$${idx++}`));
      values.push(refIn);
    }

    // Optional delivery_state facet filter.
    if (trackingInActive) {
      // no facet narrowing — the pasted keys ARE the filter
    } else if (deliveryStateFilter === 'DELIVERED_UNOPENED') {
      // Carrier delivered the box AND no operator scan happened yet at the receiving station.
      conditions.push(
        `stn.is_delivered = true
           AND NOT ${SHIPMENT_SCANNED_PREDICATE}`,
      );
    } else if (deliveryStateFilter === 'DELIVERED_NOT_UNBOXED') {
      // Carrier delivered + warehouse has not unboxed yet (broader than DELIVERED_UNOPENED — includes dock-scanned cartons still waiting to unbox).
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
      // Shipment is alive (not terminal, not delivered) but either the carrier flagged an exception or no new scan has landed in >72h.
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
      // Tracking# is registered with a known carrier but the carrier sync hasn't returned a useful status (NULL / UNKNOWN).
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

    // PO purchase-date range filter.
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
    // "Where did it go" — the inverse of `incoming`.
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
  } else if (view === 'exceptions') {
    // Inbound lines that need a person. Same population as Incoming — on a PO,
    // nothing received, no dock scan — EXCEPT the vendor-received guard: a Zoho
    // "received" with nothing scanned is exactly one of the reasons.
    const warehouseZip = normalizePostalCode(input.warehousePostal);
    if (warehouseZip) {
      exceptionZipParam = `$${idx++}`;
      values.push(warehouseZip);
    }
    conditions.push(exceptionsViewPredicateSql(universalIncoming, exceptionZipParam));
  } else if (view === 'reconcile') {
    // No lane: a pasted number is about THAT delivery wherever it is now —
    // on its way, docked, tested or failed. No list, no rows.
    if (refIn.length === 0) {
      conditions.push('FALSE');
    } else {
      conditions.push(lineRefMatchSql(`$${idx++}`));
      values.push(refIn);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // view=all/activity sort by the most recent tracking→PO pairing event for the carton (max receiving_scans.scanned_at), so freshly-paired…
  const incomingOrderBy =
    incomingSort === 'zoho_oldest'
      ? `ORDER BY mirror.po_date ASC NULLS LAST, rl.id ASC`
      : incomingSort === 'expected_soonest'
        ? `ORDER BY mirror.expected_delivery_date ASC NULLS LAST, rl.id ASC`
        : incomingSort === 'recently_added'
          ? `ORDER BY rl.created_at DESC, rl.id DESC`
          : incomingSort === 'urgency'
            ? `ORDER BY ${INCOMING_URGENCY_RANK_SQL}, mirror.po_date DESC NULLS LAST, rl.id DESC`
            : `ORDER BY mirror.po_date DESC NULLS LAST, rl.id DESC`;
  let orderBy =
    view === 'incoming' || view === 'reconcile' || view === 'exceptions'
      ? incomingOrderBy
      // Most recently departed first — the lane answers "where did the thing I was just looking at go", so recency IS the ranking.
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
          // Deliveries › Docked asks for the full Arrival spine. The Unbox
          // priority queue keeps its legacy door timestamp unless it explicitly
          // selects this arrival-ledger sort.
          ? (historySort === 'scanned_newest'
              ? `ORDER BY COALESCE(scan_first.scanned_at::text, rt.door_received_at::text, rl.created_at::text) DESC, rl.id DESC`
              : `ORDER BY rt.door_received_at::text DESC NULLS LAST, rl.id DESC`)
        : view === 'unbox_opened'
          // First Unbox-open wins (COALESCE-once ru.opened_at). Re-scans append
          // ops_events but must NOT reorder the rail — ops MAX is legacy fallback
          // only when the column is missing. Never fall through to triage door times.
          ? `ORDER BY COALESCE(ru.opened_at::text, unbox_open.unbox_opened_at::text) DESC NULLS LAST, rl.id DESC`
        : view === 'testing'
          // Sort the "tested" feed by the SAME verdict time the rail renders (tr_agg.tested_at) so the timeline reads monotonically.
          ? `ORDER BY tr_agg.tested_at DESC NULLS LAST, rl.id DESC`
          : view === 'needs-test'
            // Newest-received first — the testing to-do reads like an inbox with the freshest units at the top.
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
  // ?sort=priority:
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

  // Testing-view verdict rollup:
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

  // Incoming-only extras:
  const incomingExtrasSelect =
    view === 'incoming' || view === 'reconcile' || view === 'exceptions'
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
                stn.estimated_delivery_at::text      AS shipment_estimated_delivery_at,
                ${SHIPMENT_SIGNED_BY_SQL},
                ${SHIPMENT_DELIVERY_ATTEMPTS_SQL},
                stn_evt.event_city                   AS shipment_latest_event_city,
                stn_evt.event_postal_code            AS shipment_latest_event_postal,
                mirror.po_date::text                 AS po_date,
                mirror.expected_delivery_date::text  AS expected_delivery_date,
                mirror.vendor_name::text             AS vendor_name`
      : '';
  // Phase 2: surface the Zoho PO mirror status so the UI can badge a physically-present box whose PO Zoho already marks received/closed…
  const needsZohoMirror =
    view === 'incoming'
    || view === 'reconcile'
    || view === 'exceptions'
    || view === 'incoming_removed'
    || view === 'scanned'
    || view === 'activity'
    || view === 'all'
    || view === 'unbox_opened';
  // History cards name who sold the carton (line 1: platform · vendor); the
  // incoming views already carry `vendor_name` in their extras.
  const zohoStatusSelect = needsZohoMirror
    ? `, mirror.status AS zoho_status, mirror.last_synced_at::text AS zoho_status_synced_at${view === 'activity' ? ', mirror.vendor_name::text AS vendor_name' : ''}`
    : '';
  /** The two removal signals the row shape does not already carry. */
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
  // Universal Incoming:
  const platformAccountJoin =
    view === 'incoming' || view === 'reconcile' || view === 'exceptions'
      ? `LEFT JOIN platform_accounts pa_inbound
             ON pa_inbound.id = rl.platform_account_id
            AND pa_inbound.organization_id = rl.organization_id`
      : '';
  // Exceptions: the reason code (same CASE as the WHERE) and the ZIP it was judged against.
  const exceptionSelect =
    view === 'exceptions'
      ? `, ${incomingExceptionCodeSql(exceptionZipParam)} AS exception_code,
                ${exceptionZipParam ? `${exceptionZipParam}::text` : 'NULL::text'} AS warehouse_postal`
      : '';
  const platformAccountSelect =
    view === 'incoming' || view === 'reconcile' || view === 'exceptions'
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
                staff_uo.name                AS unbox_opened_by_name,
                ru.opened_by                 AS receiving_unbox_opened_by,
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
                COALESCE(NULLIF(BTRIM(rl_ret.return_reason), ''), NULLIF(BTRIM(r.return_reason), '')) AS return_reason,
                rl_ret.rma_ref               AS return_rma_ref,
                rl_ret.source_order_id       AS return_source_order_id,
                stn.tracking_number_raw      AS shipment_tracking_number,
                stn.carrier                  AS shipment_carrier,
                stn.latest_status_category   AS shipment_status_category,
                stn.is_delivered             AS shipment_is_delivered,
                stn.delivered_at             AS shipment_delivered_at,
                ${RECEIVING_LINE_IMAGE_URL_SQL},
                ${RECEIVING_LINE_LISTING_EVIDENCE_SQL},
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
                ${platformAccountSelect}${exceptionSelect}
                ${viewedAtSelect}
                ${unboxOpenedSelect}
         FROM receiving_line rl
         LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
         LEFT JOIN receiving_line_zoho rz     ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         ${PUTAWAY_STAGED_JOIN_SQL}
         LEFT JOIN receiving_line_return rl_ret ON rl_ret.receiving_line_id = rl.id AND rl_ret.organization_id = rl.organization_id
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
         LEFT JOIN staff staff_uo                ON staff_uo.id = ru.opened_by
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

/** Unmatched/unfound cartons live in the `receiving` table with no `receiving_line` row yet, so they never come back from the main query. */
export function shouldIncludeUnmatchedPlaceholders(query: ReceivingLinesQuery): boolean {
  return (
    ((query.view === 'all' || query.view === 'activity' || query.view === 'scanned') || (query.view === 'reconcile' && query.refIn.length > 0)) &&
    query.searchScope !== 'zoho_po' &&
    !receivingHistorySkipsUnmatchedPlaceholders(query.searchField)
  );
}

/** The lineless cartons Docked / Unboxed append as placeholders (no `receiving_line` yet): unmatched + local pickup. References `r`. */
export const LINELESS_CARTON_SOURCE_SQL = `r.source IN ('unmatched', 'local_pickup')`;

/** Unboxed (`view=activity`) membership for lineless cartons. References `ru` and the `unbox_open` lateral. */
export const ACTIVITY_UNMATCHED_UNBOX_TOUCH_SQL = ` AND (
              ru.unboxed_at IS NOT NULL
              OR ru.opened_at IS NOT NULL
              OR unbox_open.unbox_opened_at IS NOT NULL
            )`;

/** Docked (`view=scanned`) lineless cartons: arrived physically, not opened on Unbox. */
export const SCANNED_UNMATCHED_DOCK_TOUCH_SQL = ` AND (
              EXISTS (
                SELECT 1 FROM receiving_triage rt_docked
                WHERE rt_docked.receiving_id = r.id
                  AND rt_docked.organization_id = r.organization_id
                  AND rt_docked.door_received_at IS NOT NULL
              )
              OR EXISTS (SELECT 1 FROM receiving_scans rs_docked WHERE rs_docked.receiving_id = r.id)
              OR EXISTS (
                SELECT 1 FROM ops_events oe_docked
                WHERE oe_docked.organization_id = r.organization_id
                  AND oe_docked.entity_type = 'receiving'
                  AND oe_docked.entity_id = r.id
                  AND oe_docked.event_type = 'TRACKING_SCANNED'
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM receiving_unbox ru_docked
              WHERE ru_docked.receiving_id = r.id
                AND ru_docked.organization_id = r.organization_id
                AND (ru_docked.opened_at IS NOT NULL OR ru_docked.unboxed_at IS NOT NULL)
            )
            AND NOT EXISTS (
              SELECT 1 FROM ops_events oe_unbox
              WHERE oe_unbox.organization_id = r.organization_id
                AND oe_unbox.entity_type = 'receiving'
                AND oe_unbox.entity_id = r.id
                AND oe_unbox.event_type = 'UNBOX_SCAN_OPENED'
            )`;

/** Placeholder rows + count for lineless unmatched/local-pickup/(search) zoho_po cartons. */
export function buildUnmatchedPlaceholdersSql(
  query: ReceivingLinesQuery,
  orgId: string,
): BuiltListSql {
  const { search, searchField } = query;
  // $1 is reserved for orgId (these placeholder queries run on `receiving`,
  // which is org-owned); the optional search pattern (or the pasted keys) is $2.
  const unmatchedSearchVals: unknown[] = [orgId];
  let unmatchedSearchSql = '';
  // A pasted list: the lineless cartons a pasted number names. Reconcile has
  // no lane (door-scanned but not yet matched is RECEIVED, not "no match");
  // Each carton view keeps its own physical-stage membership gate below.
  const reconcile = query.view === 'reconcile';
  const pasted = reconcile || (query.view === 'activity' && query.refIn.length > 0);
  if (pasted) {
    unmatchedSearchVals.push(query.refIn);
    unmatchedSearchSql = ` AND (stn.tracking_number_normalized = ANY($2::text[])
            OR ${canonicalSql('r.zoho_purchaseorder_number')} = ANY($2::text[])
            OR ${canonicalSql('r.source_order_id')} = ANY($2::text[]))`;
  } else if (search) {
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
  // Browse Unboxed stays Unfound/local-pickup + Unbox-touched. Docked uses the
  // arrival-without-Unbox gate. A paste owns $2, so text search stands down.
  const searchActive = Boolean(search) && !pasted;
  const sourceInSql = reconcile
    ? ''
    : searchActive
      ? `AND r.source IN ('unmatched', 'local_pickup', 'zoho_po')`
      : `AND ${LINELESS_CARTON_SOURCE_SQL}`;
  const activityGatesMembership = query.view === 'activity' && !searchActive;
  const activityUnboxTouchSql = activityGatesMembership
    ? ACTIVITY_UNMATCHED_UNBOX_TOUCH_SQL
    : '';
  const scannedDockTouchSql = query.view === 'scanned' ? SCANNED_UNMATCHED_DOCK_TOUCH_SQL : '';
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
                  stn.estimated_delivery_at::text AS shipment_estimated_delivery_at,
                ${SHIPMENT_SIGNED_BY_SQL},
                ${SHIPMENT_DELIVERY_ATTEMPTS_SQL},
                  COALESCE(ops_scan.first_scanned_at, scan_first.scanned_at)::text  AS first_scanned_at,
                  COALESCE(ops_scan.last_scanned_at, rs_agg.last_scan)::text       AS last_scan_at,
                  COALESCE(ru.opened_at::text, unbox_open.unbox_opened_at::text) AS unbox_opened_at,
                  staff_ub.name AS unboxed_by_name,
                  staff_uo.name AS unbox_opened_by_name,
                  ru.unboxed_by AS receiving_unboxed_by,
                  ru.opened_by AS receiving_unbox_opened_by,
                ${sqlReceivingPhotoCount('r.id', 'r.organization_id')} AS photo_count,
                ${sqlReceivingCartonZendeskTicketColumn()}
           FROM receiving_carton r
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
           ${sqlCartonLinkedSupportTicketLateralJoin()}
           LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
           LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
           LEFT JOIN staff staff_ub ON staff_ub.id = ru.unboxed_by
           LEFT JOIN staff staff_uo ON staff_uo.id = ru.opened_by
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
             ${sourceInSql}
             AND NOT EXISTS (
               SELECT 1 FROM receiving_line rl
                WHERE rl.receiving_id = r.id
                  AND rl.organization_id = r.organization_id
             )
             ${unmatchedSearchSql}${activityUnboxTouchSql}${scannedDockTouchSql}
           ORDER BY COALESCE(rs_agg.last_scan::text, rt.door_received_at::text, r.created_at::text) DESC NULLS LAST,
                    r.id DESC
           ${reconcile ? '' : 'LIMIT 150'}`,
      params: unmatchedSearchVals,
    },
    count: {
      sql:
        `SELECT COUNT(*)::bigint AS n
             FROM receiving_carton r
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id${countUnboxJoinsSql}
            WHERE r.organization_id = $1
              ${sourceInSql}
              AND NOT EXISTS (
                SELECT 1 FROM receiving_line rl
                 WHERE rl.receiving_id = r.id
                   AND rl.organization_id = r.organization_id
              )
              ${unmatchedSearchSql}${activityUnboxTouchSql}${scannedDockTouchSql}`,
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
  // Same pre-limit as the main list:
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
                  staff_ub.name AS unboxed_by_name,
                  staff_uo.name AS unbox_opened_by_name,
                  ru.unboxed_by AS receiving_unboxed_by,
                  ru.opened_by AS receiving_unbox_opened_by,
                  ${sqlReceivingPhotoCount('r.id', 'r.organization_id')} AS photo_count,
                  ${sqlReceivingCartonZendeskTicketColumn()}
           FROM receiving_carton r
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
           ${sqlCartonLinkedSupportTicketLateralJoin()}
           LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
           LEFT JOIN receiving_unbox ru  ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
           LEFT JOIN staff staff_ub ON staff_ub.id = ru.unboxed_by
           LEFT JOIN staff staff_uo ON staff_uo.id = ru.opened_by
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
