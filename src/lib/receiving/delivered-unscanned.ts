/** Single source of truth for "delivered but not scanned" (dock hunt queue). */

import { ZOHO_TERMINAL_STATUSES } from '@/lib/receiving/zoho-received-status';
import type { OrgId } from '@/lib/tenancy/constants';

/** Hunt-queue window — older boxes belong in Loss/Claims (admin), not the dock. */
export const DELIVERED_UNSCANNED_WINDOW_DAYS = 14;

/** Defensive cap on the rendered list. */
export const DELIVERED_UNSCANNED_CAP = 100;

/** Hours-since-delivered SLA bands for the hunt queue (derived from delivered_at). */
export const DELIVERED_UNSCANNED_AGE_BANDS = ['lt_24h', 'h24_48', 'gt_48h'] as const;
export type DeliveredUnscannedAgeBand = (typeof DELIVERED_UNSCANNED_AGE_BANDS)[number];

/**
 * SQL CASE expression over `stn.delivered_at` → age band. Callers that already
 * projected `delivered_at` can pass that column name instead.
 */
export function deliveredUnscannedAgeBandSql(deliveredAtExpr = 'stn.delivered_at'): string {
  return `CASE
    WHEN ${deliveredAtExpr} > NOW() - interval '24 hours' THEN 'lt_24h'
    WHEN ${deliveredAtExpr} > NOW() - interval '48 hours' THEN 'h24_48'
    ELSE 'gt_48h'
  END`;
}

/**
 * source_system values that mark a shipment as INBOUND (a dock arrival) even
 * when no `receiving` row exists yet. Outbound order/packer tracking is also
 * "delivered, never scanned" but must not leak into this surface.
 */
export const INBOUND_SOURCE_SYSTEMS = [
  'zoho_po',
  'ebay_purchase',
  'receiving_lines_patch',
  'receiving.link-po',
  'receiving_entry',
] as const;

const INBOUND_SOURCE_SYSTEMS_SQL = INBOUND_SOURCE_SYSTEMS.map((s) => `'${s}'`).join(',');

/**
 * SQL predicate (references the alias `stn`) — a shipment is inbound when it
 * has a receiving row OR its source_system is a receiving origin.
 */
export const INBOUND_SHIPMENT_PREDICATE = `(
  EXISTS (SELECT 1 FROM receiving_carton r WHERE r.shipment_id = stn.id)
  OR stn.source_system IN (${INBOUND_SOURCE_SYSTEMS_SQL})
)`;

/** SQL predicate (references alias `stn`) — TRUE when an operator has scanned this shipment at the dock, in ANY receiving mode. */
/** The bare scan→shipment match condition — references `rs` (a `receiving_scans` row), `r2` (its `receiving` row), and the outer `stn`. */
export const SHIPMENT_SCAN_MATCH_CONDITION = `(
  (
    length(stn.tracking_number_normalized) >= 8
    AND position(
          right(stn.tracking_number_normalized, 8)
          IN regexp_replace(upper(rs.tracking_number), '[^A-Z0-9]', '', 'g')
        ) > 0
  )
  OR r2.shipment_id = stn.id
  OR rs.shipment_id = stn.id
)`;

export const SHIPMENT_SCANNED_PREDICATE = `EXISTS (
  SELECT 1
    FROM receiving_scans rs
    LEFT JOIN receiving_carton r2 ON r2.id = rs.receiving_id
   WHERE ${SHIPMENT_SCAN_MATCH_CONDITION}
)`;

/** The canonical delivered-unscanned base query body. */
export function deliveredUnscannedBaseSql(windowParam: string, orgParam?: string): string {
  // shipping_tracking_numbers (alias `stn`) and zoho_po_mirror are NEEDS-COL (no organization_id), so the shipment row itself can only be…
  const inboundPredicate = orgParam
    ? `(
  EXISTS (SELECT 1 FROM receiving_carton r WHERE r.shipment_id = stn.id AND r.organization_id = ${orgParam})
  OR stn.source_system IN (${INBOUND_SOURCE_SYSTEMS_SQL})
)`
    : INBOUND_SHIPMENT_PREDICATE;
  const scannedPredicate = orgParam
    ? `EXISTS (
      SELECT 1
        FROM receiving_scans rs
        LEFT JOIN receiving_carton r2 ON r2.id = rs.receiving_id
       WHERE rs.organization_id = ${orgParam}
         AND ${SHIPMENT_SCAN_MATCH_CONDITION}
    )`
    : SHIPMENT_SCANNED_PREDICATE;
  const zohoPoResolved = orgParam
    ? `(
  EXISTS (
    SELECT 1 FROM zoho_po_mirror mm
     WHERE COALESCE(mm.reference_number, '') <> ''
       AND regexp_replace(upper(mm.reference_number), '[^A-Z0-9]', '', 'g')
           = stn.tracking_number_normalized
  )
  OR EXISTS (
    SELECT 1 FROM receiving_carton r
     WHERE r.shipment_id = stn.id
       AND r.zoho_purchaseorder_id IS NOT NULL
       AND r.organization_id = ${orgParam}
  )
)`
    : ZOHO_PO_RESOLVED_SHIPMENT_PREDICATE;
  return `
    SELECT DISTINCT ON (stn.tracking_number_normalized)
           stn.id                       AS shipment_id,
           stn.carrier,
           stn.tracking_number_raw,
           stn.tracking_number_normalized,
           stn.delivered_at::text       AS delivered_at,
           stn.source_system,
           ${deliveredUnscannedAgeBandSql('stn.delivered_at')} AS age_band
      FROM shipping_tracking_numbers stn
     WHERE stn.is_delivered = true
       AND stn.delivered_at > NOW() - (${windowParam} || ' days')::interval
       AND ${inboundPredicate}
       AND NOT ${scannedPredicate}
       -- Physical-first: dock scan is the only operational exit. Zoho terminal
       -- status is enrichment on the list row, never a hard exclusion — ERP
       -- "received" must not hide an unscanned box on the floor.
       -- Delivered-unscanned is Zoho-resolved inbound work: the tracking# must
       -- resolve to a PO (reference# match or linked receiving row). Unmatched
       -- dock scans and orphan STNs belong in triage / PO Mailbox, not here.
       AND ${zohoPoResolved}
     ORDER BY stn.tracking_number_normalized, stn.delivered_at ASC
  `;
}

/** Zoho PO statuses that mean "no longer incoming" — re-exported from the leaf SoT so this module's existing import path keeps working. */
export { ZOHO_TERMINAL_STATUSES };

const ZOHO_TERMINAL_STATUSES_SQL = ZOHO_TERMINAL_STATUSES.map((s) => `'${s}'`).join(',');

/**
 * SQL guard (references a `zoho_po_mirror` row aliased `mirror`) that keeps
 * Zoho-received/closed POs out of the Incoming queue. Drop into a WHERE next to
 * the `workflow_status='EXPECTED'` / `quantity_received=0` filters.
 */
export const NOT_ZOHO_RECEIVED_PREDICATE = `COALESCE(mirror.status, '') NOT IN (${ZOHO_TERMINAL_STATUSES_SQL})`;

/** Shipment-anchored counterpart to {@link NOT_ZOHO_RECEIVED_PREDICATE}. */
export const NOT_ZOHO_RECEIVED_SHIPMENT_PREDICATE = `NOT EXISTS (
  SELECT 1 FROM zoho_po_mirror mm
   WHERE COALESCE(mm.status, '') IN (${ZOHO_TERMINAL_STATUSES_SQL})
     AND (
       mm.zoho_purchaseorder_id = (
         SELECT r.zoho_purchaseorder_id FROM receiving_carton r
          WHERE r.shipment_id = stn.id AND r.zoho_purchaseorder_id IS NOT NULL
          ORDER BY r.id LIMIT 1
       )
       OR (
         COALESCE(mm.reference_number, '') <> ''
         AND regexp_replace(upper(mm.reference_number), '[^A-Z0-9]', '', 'g')
             = stn.tracking_number_normalized
       )
     )
)`;

/** SQL predicate (references alias `stn`) — TRUE when the shipment ties to a Zoho PO (reference# match or a linked… */
export const ZOHO_PO_RESOLVED_SHIPMENT_PREDICATE = `(
  EXISTS (
    SELECT 1 FROM zoho_po_mirror mm
     WHERE COALESCE(mm.reference_number, '') <> ''
       AND regexp_replace(upper(mm.reference_number), '[^A-Z0-9]', '', 'g')
           = stn.tracking_number_normalized
  )
  OR EXISTS (
    SELECT 1 FROM receiving_carton r
     WHERE r.shipment_id = stn.id
       AND r.zoho_purchaseorder_id IS NOT NULL
  )
)`;

/** SQL predicate (references alias `stn`) for a shipment the carrier API can't resolve against its records — the carrier/number don't match: */
export const CARRIER_MISMATCH_PREDICATE = `(
  stn.id IS NOT NULL
  AND COALESCE(stn.is_delivered, false) = false
  AND COALESCE(stn.is_terminal, false) = false
  AND (
    upper(COALESCE(stn.carrier, '')) = 'UNKNOWN'
    OR stn.last_error_code IN ('NOT_FOUND', 'UNKNOWN_CARRIER')
  )
)`;

/** pg-like client surface so this helper stays decoupled from a specific pool. */
interface Queryable {
  query<T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

/**
 * Count of delivered-unscanned shipments. Wraps the canonical base so it always
 * matches the list length for the same window.
 */
export async function getDeliveredUnscannedCount(
  client: Queryable,
  windowDays: number = DELIVERED_UNSCANNED_WINDOW_DAYS,
  orgId?: OrgId,
): Promise<number> {
  if (orgId) {
    // shipping_tracking_numbers is NEEDS-COL → GUC-wrap (tenantQuery) + pin the
    // org-bearing aliases inside the shared predicates via $2.
    const { tenantQuery } = await import('@/lib/tenancy/db');
    const { rows } = await tenantQuery<{ n: number }>(
      orgId,
      `SELECT COUNT(*)::int AS n FROM ( ${deliveredUnscannedBaseSql('$1', '$2')} ) d`,
      [String(windowDays), orgId],
    );
    return Number(rows[0]?.n ?? 0);
  }
  const { rows } = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ( ${deliveredUnscannedBaseSql('$1')} ) d`,
    [String(windowDays)],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Count of delivered-unscanned shipments in the claims-attention band (>48h).
 * Same canonical base as {@link getDeliveredUnscannedCount}.
 */
export async function getDeliveredUnscannedClaimsCount(
  client: Queryable,
  windowDays: number = DELIVERED_UNSCANNED_WINDOW_DAYS,
  orgId?: OrgId,
): Promise<number> {
  if (orgId) {
    const { tenantQuery } = await import('@/lib/tenancy/db');
    const { rows } = await tenantQuery<{ n: number }>(
      orgId,
      `SELECT COUNT(*)::int AS n
         FROM ( ${deliveredUnscannedBaseSql('$1', '$2')} ) d
        WHERE d.age_band = 'gt_48h'`,
      [String(windowDays), orgId],
    );
    return Number(rows[0]?.n ?? 0);
  }
  const { rows } = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM ( ${deliveredUnscannedBaseSql('$1')} ) d
      WHERE d.age_band = 'gt_48h'`,
    [String(windowDays)],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Promote email "ORDER DELIVERED" signals onto linked STN rows so the carrier
 * hunt queue sees them (email is a writer/fallback, not a parallel ops tile).
 * Sets is_delivered + delivered_at when carrier poll never confirmed delivery.
 */
export async function promoteEmailDeliverySignalsToStn(
  client: Queryable,
  orgId: OrgId,
  orderNumberNorms: string[],
  deliveredAt: Date | null,
): Promise<number> {
  const norms = [...new Set(orderNumberNorms.map((n) => n.trim()).filter(Boolean))];
  if (norms.length === 0) return 0;
  const { rows } = await client.query<{ id: number }>(
    `WITH linked AS (
       SELECT DISTINCT stn.id AS shipment_id
         FROM receiving_line_zoho rz
         JOIN receiving_line rl
           ON rl.id = rz.receiving_line_id AND rl.organization_id = rz.organization_id
         JOIN receiving_carton r
           ON (
                r.id = rl.receiving_id
             OR (rl.receiving_id IS NULL
                 AND r.source = 'zoho_po'
                 AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
                 AND r.organization_id = rl.organization_id)
           )
         JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
        WHERE rz.organization_id = $1::uuid
          AND rz.zoho_purchaseorder_number_norm = ANY($2::text[])
          AND stn.id IS NOT NULL
          AND COALESCE(stn.is_delivered, false) = false
     )
     UPDATE shipping_tracking_numbers stn
        SET is_delivered = true,
            delivered_at = COALESCE(stn.delivered_at, $3::timestamptz, NOW()),
            latest_status_category = COALESCE(stn.latest_status_category, 'DELIVERED'),
            updated_at = NOW()
       FROM linked
      WHERE stn.id = linked.shipment_id
     RETURNING stn.id`,
    [orgId, norms, deliveredAt],
  );
  return rows.length;
}
