/**
 * getPackReviewQueue — the latest-outcome queue read for the Review station's
 * packer mode (docs/todo/packer-review-station-plan.md Phase 3c / §4c).
 *
 * pack_verification_events is append-only, so the queue is the DISTINCT ON
 * latest outcome per packer_log, joined to the order / tracking for display and
 * filtered into the station's tabs:
 *   • needs_review — latest = VERIFIED (awaiting a manager decision)
 *   • exceptions   — latest = ERROR_* (floor capture or EOD error)
 *   • flagged      — latest = REVIEW_FLAGGED
 *   • approved     — latest = REVIEW_APPROVED, TODAY (warehouse civil day)
 *   • history      — latest ∈ {REVIEW_APPROVED, REVIEW_FLAGGED, READY, ERROR_*}
 *   • latest       — all latest outcomes (hydrate Packed/Shipped chips)
 *
 * Read-only, org-scoped through tenantQuery. The order lookup is a LATERAL
 * LIMIT 1 so a shipment with more than one order never fans the queue out.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getCurrentPSTDateKey, warehouseDayUtcBounds } from '@/utils/date';
import type { PackReviewBucket, PackReviewQueueRow } from './pack-review-queue-types';

export async function getPackReviewQueue(
  orgId: OrgId,
  opts: { bucket?: PackReviewBucket; limit?: number } = {},
): Promise<PackReviewQueueRow[]> {
  const bucket: PackReviewBucket = opts.bucket ?? 'needs_review';
  const limit = Math.max(1, Math.min(500, Math.trunc(opts.limit ?? 100)));

  const params: unknown[] = [orgId];
  let predicate: string;
  if (bucket === 'needs_review') {
    predicate = `l.outcome = 'VERIFIED'`;
  } else if (bucket === 'exceptions') {
    // Escape the LIKE '_' wildcard so only the ERROR_ family matches.
    predicate = `l.outcome LIKE 'ERROR\\_%'`;
  } else if (bucket === 'flagged') {
    predicate = `l.outcome = 'REVIEW_FLAGGED'`;
  } else if (bucket === 'history') {
    // Packer review history — decided + exception outcomes (not awaiting VERIFIED).
    predicate = `(
      l.outcome IN ('REVIEW_APPROVED', 'REVIEW_FLAGGED', 'READY')
      OR l.outcome LIKE 'ERROR\\_%'
    )`;
  } else if (bucket === 'latest') {
    predicate = `TRUE`;
  } else {
    const bounds = warehouseDayUtcBounds(getCurrentPSTDateKey());
    params.push(bounds?.startIso ?? new Date(0).toISOString());
    predicate = `l.outcome = 'REVIEW_APPROVED' AND l.created_at >= $${params.length}::timestamptz`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (entity_id)
        entity_id, outcome, detected_tracking, detected_order_id, shipment_id,
        review_note, verified_by_staff_id, ocr_confidence, created_at
      FROM pack_verification_events
      WHERE organization_id = $1::uuid AND entity_type = 'PACKER_LOG'
      ORDER BY entity_id, created_at DESC, id DESC
    )
    SELECT
      l.entity_id             AS packer_log_id,
      l.outcome,
      l.detected_tracking,
      l.detected_order_id,
      l.shipment_id,
      l.review_note,
      l.verified_by_staff_id,
      l.ocr_confidence,
      l.created_at,
      stn.tracking_number_raw AS tracking,
      o.order_id,
      o.product_title
    FROM latest l
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = l.shipment_id
    LEFT JOIN LATERAL (
      SELECT order_id, product_title
      FROM orders
      WHERE shipment_id = l.shipment_id AND organization_id = $1::uuid
      ORDER BY id DESC
      LIMIT 1
    ) o ON true
    WHERE ${predicate}
    ORDER BY l.created_at DESC
    LIMIT ${limitParam}
  `;

  const res = await tenantQuery(orgId, sql, params);
  return res.rows.map((r) => {
    const row = r as Record<string, unknown>;
    const toNum = (v: unknown): number | null => (v == null ? null : Number(v));
    return {
      packerLogId: Number(row.packer_log_id),
      outcome: String(row.outcome),
      detectedTracking: (row.detected_tracking as string | null) ?? null,
      detectedOrderId: (row.detected_order_id as string | null) ?? null,
      shipmentId: toNum(row.shipment_id),
      reviewNote: (row.review_note as string | null) ?? null,
      verifiedByStaffId: toNum(row.verified_by_staff_id),
      ocrConfidence: toNum(row.ocr_confidence),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      orderId: (row.order_id as string | null) ?? null,
      productTitle: (row.product_title as string | null) ?? null,
      tracking: (row.tracking as string | null) ?? null,
    };
  });
}

/** Latest verification row for one packer_log (any outcome), or null. */
export async function getPackReviewRowByPackerLogId(
  orgId: OrgId,
  packerLogId: number,
): Promise<PackReviewQueueRow | null> {
  if (!Number.isSafeInteger(packerLogId) || packerLogId <= 0) return null;

  const sql = `
    SELECT
      e.entity_id             AS packer_log_id,
      e.outcome,
      e.detected_tracking,
      e.detected_order_id,
      e.shipment_id,
      e.review_note,
      e.verified_by_staff_id,
      e.ocr_confidence,
      e.created_at,
      stn.tracking_number_raw AS tracking,
      o.order_id,
      o.product_title
    FROM pack_verification_events e
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = e.shipment_id
    LEFT JOIN LATERAL (
      SELECT order_id, product_title
      FROM orders
      WHERE shipment_id = e.shipment_id AND organization_id = $1::uuid
      ORDER BY id DESC
      LIMIT 1
    ) o ON true
    WHERE e.organization_id = $1::uuid
      AND e.entity_type = 'PACKER_LOG'
      AND e.entity_id = $2::bigint
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  `;

  const res = await tenantQuery(orgId, sql, [orgId, packerLogId]);
  if (res.rows.length === 0) return null;
  const row = res.rows[0] as Record<string, unknown>;
  const toNum = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    packerLogId: Number(row.packer_log_id),
    outcome: String(row.outcome),
    detectedTracking: (row.detected_tracking as string | null) ?? null,
    detectedOrderId: (row.detected_order_id as string | null) ?? null,
    shipmentId: toNum(row.shipment_id),
    reviewNote: (row.review_note as string | null) ?? null,
    verifiedByStaffId: toNum(row.verified_by_staff_id),
    ocrConfidence: toNum(row.ocr_confidence),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    orderId: (row.order_id as string | null) ?? null,
    productTitle: (row.product_title as string | null) ?? null,
    tracking: (row.tracking as string | null) ?? null,
  };
}
