/**
 * Inbound lane memberships for the Live feed, one row per PACKAGE, its
 * CURRENT state. Each reuses the Deliveries desk's own membership (the
 * desk's views partition the pipeline), evaluated over receiving lines
 * exactly as `/api/receiving-lines` joins them (the D1 carton soft join) and
 * collapsed to the carton (or, in transit, the shipment):
 *   - in-transit = `view=incoming` (`incomingViewPredicateSql`) ∩ a tracked,
 *     undelivered shipment;
 *   - in-delivered-unscanned = the dock hunt queue (`deliveredUnscannedBaseSql`);
 *   - in-docked = `view=scanned` (`scannedViewPredicateSql`) ∪ the lineless
 *     docked cartons — Deliveries › Docked (lens `received` = the first dock
 *     scan, else the door stamp);
 *   - in-unboxed = `view=activity` (`ACTIVITY_VIEW_PREDICATE_SQL`) ∪ the
 *     lineless unboxed cartons — Deliveries › Unboxed (lens `unboxed`, and
 *     `received` as on Docked);
 *   - in person, one row per LOCAL PICKUP (`local_pickup_orders`, a purchase
 *     we collect from the seller): in-pickup-to-collect = DRAFT. A done
 *     (COMPLETED) pickup has no lane: no collection or unbox fact is recorded
 *     on it, so it never claims Docked.
 */

import 'server-only';
import {
  ACTIVITY_UNMATCHED_UNBOX_TOUCH_SQL,
  ACTIVITY_VIEW_PREDICATE_SQL,
  LINELESS_CARTON_SOURCE_SQL,
  SCANNED_UNMATCHED_DOCK_TOUCH_SQL,
  incomingViewPredicateSql,
  scannedViewPredicateSql,
} from '@/lib/receiving/lines/build-sql';
import { RECEIVING_LINE_IMAGE_URL_SQL } from '@/lib/receiving/lines/sql-receiving-image';
import {
  DELIVERED_UNSCANNED_WINDOW_DAYS,
  NOT_ZOHO_RECEIVED_PREDICATE,
  deliveredUnscannedBaseSql,
} from '@/lib/receiving/delivered-unscanned';
import { INBOUND_MARKETPLACE_CARTON_SOURCES_SQL } from '@/lib/inbound/mirror';
import { unboxOpenedPredicateSql } from '@/lib/receiving/unbox-scan-opened-sql';
import { skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import type { LiveFeedStatusId, LiveFeedStatusSpec } from '@/lib/live-feed/statuses';
import { FEED_REFS, feedAgingSql, feedRowSql, type FeedMembership } from '@/lib/live-feed/feed-sql';

const R = FEED_REFS;

/** The carrier token: the shipment's, else the carton's; blank → `UNKNOWN`. */
const INBOUND_CARRIER_SQL = `UPPER(COALESCE(NULLIF(BTRIM(stn.carrier), ''), NULLIF(BTRIM(r.carrier), ''), 'UNKNOWN'))`;

/**
 * Receiving lines with the joins every Deliveries membership reads (`rl`,
 * `rz`, `mirror`, `r`, `rt`, `ru`, `stn`): the D1 wrong-shipment guard picks
 * the line's carton — the direct FK, else the PO / marketplace order fallback,
 * preferring a carton that carries a shipment, else the newest.
 */
const LINE_BASE_FROM_SQL = `
        FROM receiving_line rl
        LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
        LEFT JOIN zoho_po_mirror mirror
          ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
         AND mirror.organization_id = rl.organization_id
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
        LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
        LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id`;

/** The PO a line answers to: its Zoho PO number, else the carton's, else the marketplace order. */
const LINE_PO_SQL = 'COALESCE(rz.zoho_purchaseorder_number, r.zoho_purchaseorder_number, rl.source_order_id)';

/** The cartons whose lines pass `predicate`: `receiving_id, line_id` (lead line), `po_number`. */
function cartonsOfLinesSql(predicate: string, extraFrom = ''): string {
  return `
        SELECT r.id AS receiving_id, MIN(rl.id) AS line_id, MIN(${LINE_PO_SQL}) AS po_number
        ${LINE_BASE_FROM_SQL}${extraFrom}
        WHERE rl.organization_id = ${R.org}
          AND r.id IS NOT NULL
          AND ${predicate}
        GROUP BY r.id`;
}

/** Lineless placeholder cartons (unmatched / local pickup) passing `touchSql` (` AND …`). */
function linelessCartonsSql(touchSql: string, extraFrom = ''): string {
  return `
        SELECT r.id AS receiving_id, NULL::int AS line_id, r.zoho_purchaseorder_number AS po_number
          FROM receiving_carton r${extraFrom}
         WHERE r.organization_id = ${R.org}
           AND ${LINELESS_CARTON_SOURCE_SQL}
           AND NOT EXISTS (
             SELECT 1 FROM receiving_line rl
              WHERE rl.receiving_id = r.id
                AND rl.organization_id = r.organization_id
           )${touchSql}`;
}

/** The carton's joins once its id is known (`pkg.receiving_id`). */
const CARTON_JOIN_SQL = `
      JOIN receiving_carton r ON r.id = pkg.receiving_id AND r.organization_id = ${R.org}
      LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
      LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id`;

/** Latest Unbox-surface open of carton `r` (the ops spine), as `unbox_open.unbox_opened_at`. */
const UNBOX_OPEN_JOIN_SQL = `
        LEFT JOIN LATERAL (
          SELECT MAX(oe_uo.occurred_at) AS unbox_opened_at
            FROM ops_events oe_uo
           WHERE oe_uo.organization_id = r.organization_id
             AND oe_uo.entity_type = 'receiving'
             AND oe_uo.entity_id = r.id
             AND oe_uo.event_type = 'UNBOX_SCAN_OPENED'
        ) unbox_open ON TRUE`;

/** The carton's first dock scan, as `scan_first` (`scanned_at`, `scanned_by`). */
const SCAN_FIRST_JOIN_SQL = `
      LEFT JOIN LATERAL (
        SELECT rs.scanned_at, rs.scanned_by
          FROM receiving_scans rs
         WHERE rs.receiving_id = r.id
         ORDER BY rs.scanned_at ASC NULLS LAST, rs.id ASC
         LIMIT 1
      ) scan_first ON TRUE`;

/** When the carton was received at the dock: its first dock scan, else the door stamp (needs {@link SCAN_FIRST_JOIN_SQL}). */
const RECEIVED_AT_SQL = 'COALESCE(scan_first.scanned_at, rt.door_received_at)';

/** When the carton was opened (else unboxed) on Unbox (needs {@link UNBOX_OPEN_JOIN_SQL}). */
const UNBOXED_AT_SQL = 'COALESCE(ru.opened_at, ru.unboxed_at, unbox_open.unbox_opened_at)';

const STALLED_SQL = `(stn.id IS NOT NULL
         AND COALESCE(stn.is_terminal, false) = false
         AND COALESCE(stn.is_delivered, false) = false
         AND (stn.has_exception = true
              OR (stn.latest_event_at IS NOT NULL AND stn.latest_event_at < (NOW() - interval '72 hours'))))`;

export interface InboundMembershipOptions {
  /** `isIncomingUniversal(org)` — the Incoming population Deliveries paints. */
  universalIncoming: boolean;
  /** `isUnboxRailColumnRead()` — Docked's not-yet-opened gate reads the committed column only. */
  unboxRailColumnRead: boolean;
  /** `!isReceivingPhysicalStateFirst()` — Docked hides Zoho-received POs. */
  scannedZohoExclusion: boolean;
}

function inboundMembershipSql(id: LiveFeedStatusId, opts: InboundMembershipOptions): string | null {
  switch (id) {
    case 'in-transit':
      /** Expected and untouched (Incoming), on a tracked shipment the carrier has not delivered — one row per shipment. */
      return `
    SELECT ${feedRowSql({
      key: `'t:' || stn.id::text`,
      at: 'COALESCE(stn.carrier_accepted_at, stn.first_in_transit_at, stn.label_created_at, stn.created_at)',
      carrier: `UPPER(COALESCE(NULLIF(BTRIM(stn.carrier), ''), 'UNKNOWN'))`,
      tracking: 'stn.tracking_number_raw',
      shipment_id: 'stn.id',
      receiving_id: 'pkg.receiving_id',
      line_id: 'pkg.line_id',
      po_number: 'pkg.po_number',
      urgency: `CASE WHEN stn.latest_status_category = 'OUT_FOR_DELIVERY' THEN 'due_today' WHEN ${STALLED_SQL} THEN 'aging' END`,
      sub: `CASE WHEN stn.latest_status_category = 'OUT_FOR_DELIVERY' THEN 'out_for_delivery' WHEN ${STALLED_SQL} THEN 'stalled' END`,
    })}
      FROM (
        SELECT stn.id AS shipment_id, MIN(r.id) AS receiving_id, MIN(rl.id) AS line_id, MIN(${LINE_PO_SQL}) AS po_number
        ${LINE_BASE_FROM_SQL}
        WHERE rl.organization_id = ${R.org}
          AND ${incomingViewPredicateSql(opts.universalIncoming, false)}
          AND stn.id IS NOT NULL
          AND COALESCE(stn.is_delivered, false) = false
        GROUP BY stn.id
      ) pkg
      JOIN shipping_tracking_numbers stn ON stn.id = pkg.shipment_id`;

    case 'in-delivered-unscanned':
      /** The dock hunt queue, one row per shipment; claims band (>48h) is late, 24–48h aging. */
      return `
    SELECT ${feedRowSql({
      key: `'d:' || d.shipment_id::text`,
      at: 'd.delivered_at::timestamptz',
      carrier: `UPPER(COALESCE(NULLIF(BTRIM(d.carrier), ''), 'UNKNOWN'))`,
      tracking: 'd.tracking_number_raw',
      shipment_id: 'd.shipment_id',
      receiving_id: 'rc.id',
      po_number: 'rc.zoho_purchaseorder_number',
      urgency: `CASE d.age_band WHEN 'gt_48h' THEN 'late' WHEN 'h24_48' THEN 'aging' END`,
    })}
      FROM (${deliveredUnscannedBaseSql(`'${DELIVERED_UNSCANNED_WINDOW_DAYS}'`, R.org)}) d
      JOIN shipping_tracking_numbers stn_org ON stn_org.id = d.shipment_id AND stn_org.organization_id = ${R.org}
      LEFT JOIN LATERAL (
        SELECT r.id, r.zoho_purchaseorder_number
          FROM receiving_carton r
         WHERE r.organization_id = ${R.org} AND r.shipment_id = d.shipment_id
         ORDER BY r.id
         LIMIT 1
      ) rc ON TRUE`;

    case 'in-docked': {
      /** Deliveries › Docked: the first dock scan (else the door stamp) — entered and received; the door receiver (else the first scanner). */
      const zoho = opts.scannedZohoExclusion ? `\n          AND ${NOT_ZOHO_RECEIVED_PREDICATE}` : '';
      return `
    SELECT ${feedRowSql({
      key: `'r:' || r.id::text`,
      at: RECEIVED_AT_SQL,
      staff_id: 'COALESCE(rt.door_received_by, scan_first.scanned_by)',
      carrier: INBOUND_CARRIER_SQL,
      tracking: 'stn.tracking_number_raw',
      shipment_id: 'r.shipment_id',
      receiving_id: 'r.id',
      line_id: 'pkg.line_id',
      po_number: 'pkg.po_number',
      urgency: `COALESCE(${feedAgingSql(RECEIVED_AT_SQL)},
                CASE WHEN COALESCE(r.is_priority, false) OR r.priority_tier IS NOT NULL THEN 'due_today' END)`,
      received_at: RECEIVED_AT_SQL,
    })}
      FROM (${cartonsOfLinesSql(`${scannedViewPredicateSql(unboxOpenedPredicateSql(opts.unboxRailColumnRead))}${zoho}`)}
        UNION${linelessCartonsSql(SCANNED_UNMATCHED_DOCK_TOUCH_SQL)}
      ) pkg${CARTON_JOIN_SQL}${SCAN_FIRST_JOIN_SQL}`;
    }

    case 'in-unboxed':
      /** Deliveries › Unboxed: opened (else unboxed) on Unbox — entered and unboxed; the unboxer (else the opener). */
      return `
    SELECT ${feedRowSql({
      key: `'r:' || r.id::text`,
      at: UNBOXED_AT_SQL,
      staff_id: 'COALESCE(ru.unboxed_by, ru.opened_by)',
      carrier: INBOUND_CARRIER_SQL,
      tracking: 'stn.tracking_number_raw',
      shipment_id: 'r.shipment_id',
      receiving_id: 'r.id',
      line_id: 'pkg.line_id',
      po_number: 'pkg.po_number',
      received_at: RECEIVED_AT_SQL,
      unboxed_at: UNBOXED_AT_SQL,
    })}
      FROM (${cartonsOfLinesSql(ACTIVITY_VIEW_PREDICATE_SQL)}
        UNION${linelessCartonsSql(
          ACTIVITY_UNMATCHED_UNBOX_TOUCH_SQL,
          `
          LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id${UNBOX_OPEN_JOIN_SQL}`,
        )}
      ) pkg${CARTON_JOIN_SQL}${UNBOX_OPEN_JOIN_SQL}${SCAN_FIRST_JOIN_SQL}`;

    case 'in-pickup-to-collect':
      /**
       * Not done yet (DRAFT). Entered = when it was keyed; the pickup day
       * decides urgency: past = late, today = due today. A collected pickup has
       * no recorded collection fact (PICKUP_LIFECYCLE infers `collected` from
       * the pickup date), so it never moves to Docked: it stays here until done.
       */
      return `
    SELECT ${feedRowSql({
      key: `'lp:' || lpo.id::text`,
      at: 'lpo.created_at',
      staff_id: 'lpo.created_by',
      receiving_id: 'lpo.receiving_id',
      po_number: `NULLIF(BTRIM(lpo.zoho_purchaseorder_number), '')`,
      record_id: 'lpo.id::text',
      customer: `NULLIF(BTRIM(lpo.customer_name), '')`,
      urgency: `CASE
        WHEN lpo.pickup_date < (now() AT TIME ZONE '${WAREHOUSE_TIME_ZONE}')::date THEN 'late'
        WHEN lpo.pickup_date = (now() AT TIME ZONE '${WAREHOUSE_TIME_ZONE}')::date THEN 'due_today'
      END`,
      sub: `'LOCAL_PICKUP'`,
    })}
      FROM local_pickup_orders lpo
     WHERE lpo.organization_id = ${R.org}
       AND lpo.status = 'DRAFT'`;

    default:
      return null;
  }
}

/** The inbound memberships of `specs` (statuses with no inbound membership are skipped). */
export function inboundMemberships(specs: readonly LiveFeedStatusSpec[], opts: InboundMembershipOptions): FeedMembership[] {
  return specs.flatMap(({ id, kind, channels, carrier, groupBy }) => {
    const sql = inboundMembershipSql(id, opts);
    return sql ? [{ id, kind, channels, carrier, groupBy, sql }] : [];
  });
}

/**
 * The lines an inbound item expands to: each named line, plus the lead
 * (lowest id) line of each named carton. `$1` org, `$2` line ids, `$3` carton
 * ids. Title / photo sources are the receiving list's.
 */
export const INBOUND_LINES_SQL = `
  WITH carton_lead AS (
    SELECT rl.receiving_id, MIN(rl.id)::int AS lead_id, COUNT(*)::int AS line_count
      FROM receiving_line rl
     WHERE rl.organization_id = $1 AND rl.receiving_id = ANY($3::int[])
     GROUP BY rl.receiving_id
  ),
  wanted AS (
    SELECT unnest($2::int[]) AS id
    UNION
    SELECT lead_id FROM carton_lead
  )
  SELECT
    (SELECT COALESCE(json_agg(carton_lead), '[]'::json) FROM carton_lead) AS cartons,
    (SELECT COALESCE(json_agg(json_build_object(
        'id', rl.id,
        'sku', rl.sku,
        'item_name', rl.item_name,
        'catalog_product_title', sc.product_title,
        'zoho_item_title', (SELECT name FROM items WHERE zoho_item_id = rz.zoho_item_id AND status = 'active' LIMIT 1),
        'quantity', rl.quantity_expected,
        'condition', r.condition_grade,
        'unit_cost_cents', rl.unit_cost_cents,
        'unit_price', rz.unit_price,
        'currency', rl.currency,
        'image_url', li.image_url
      )), '[]'::json)
      FROM wanted w
      JOIN receiving_line rl ON rl.id = w.id AND rl.organization_id = $1
      LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
      LEFT JOIN receiving_carton r ON r.id = rl.receiving_id AND r.organization_id = rl.organization_id
      LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('rl', 'sc')}
      LEFT JOIN LATERAL (SELECT ${RECEIVING_LINE_IMAGE_URL_SQL}) li ON TRUE) AS lines`;
