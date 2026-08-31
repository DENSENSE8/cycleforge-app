import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveShipmentId } from '@/lib/shipping/resolve';
import { createStationActivityLog } from '@/lib/station-activity';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { normalizePSTTimestamp } from '@/utils/date';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import { applyOrderTrackingOps } from '@/lib/neon/orders-tracking-queries';
import { mirrorLegacyPackToAllocations } from '@/lib/inventory/sync-legacy-pack';
import type { OrgId } from '@/lib/tenancy/constants';

interface TrackingRow {
  id: number;
  shipment_id: number | null;
  shipping_tracking_number: string | null;
}

/**
 * Org-scoped last-8 prefilter on a tracking column, then exact canonical-match
 * in JS (`extractCanonicalTracking` unwraps FedEx GS1 + strips USPS routing /
 * collapses repeats — awkward to replicate in SQL). Returns the matching row.
 */
async function findByTracking(
  table: 'orders' | 'orders_exceptions',
  organizationId: number | string,
  norm: string,
): Promise<TrackingRow | null> {
  const last8 = norm.slice(-8).toUpperCase();
  const rows = await tenantQuery<TrackingRow>(
    String(organizationId),
    `SELECT id, shipment_id, shipping_tracking_number
         FROM ${table}
        WHERE organization_id = $1
          AND shipping_tracking_number IS NOT NULL
          AND right(regexp_replace(upper(shipping_tracking_number), '[^A-Z0-9]', '', 'g'), 8) = $2
        ORDER BY id DESC
        LIMIT 25`,
    [organizationId, last8],
  )
    .then((r) => r.rows)
    .catch(() => [] as TrackingRow[]);
  return (
    rows.find(
      (row) => extractCanonicalTracking(String(row.shipping_tracking_number ?? '')) === norm,
    ) ?? null
  );
}

/**
 * Fallback resolution when the carrier shipment registry has no row for the
 * scanned label. Many labels (legacy / imported eBay, or non-standard carrier
 * numbers `detectCarrier` can't classify) carry their tracking only on
 * `orders.shipping_tracking_number` — or land in the `orders_exceptions`
 * hold-bucket for unmatched scans — with no `shipping_tracking_numbers` row, so
 * {@link resolveShipmentId} returns null and scan-out reports "No shipment found"
 * even though the record plainly exists.
 *
 * Resolution order (both org-scoped):
 *   1. orders — use its shipment_id; if absent, self-heal by registering+linking
 *      a shipment through the SAME canonical path Add-Tracking uses.
 *   2. orders_exceptions — use its shipment_id (the hold-bucket row is normally
 *      backfilled with one). Exceptions aren't order-keyed, so we don't register
 *      a new shipment for a carrier-less one — its label simply has nothing to
 *      key against until tracking is reconciled.
 */
async function resolveShipmentViaOrderOrException(
  raw: string,
  organizationId: number | string,
): Promise<number | null> {
  // FedEx GS1 SoT — unwrap 96… gun reads before last-8 / exact compare.
  const norm = extractCanonicalTracking(raw);
  if (!norm) return null;

  // 1. Real orders take precedence over the exception hold-bucket.
  const order = await findByTracking('orders', organizationId, norm);
  if (order) {
    if (order.shipment_id != null) return Number(order.shipment_id);
    try {
      const result = await applyOrderTrackingOps({
        orderIds: [Number(order.id)],
        setTrackingNumbers: [String(order.shipping_tracking_number)],
        organizationId: String(organizationId) as OrgId,
      });
      if (result.primaryShipmentId != null) return result.primaryShipmentId;
    } catch {
      // fall through to the exception bucket
    }
  }

  // 2. Unmatched-scan hold bucket.
  const exception = await findByTracking('orders_exceptions', organizationId, norm);
  if (exception?.shipment_id != null) return Number(exception.shipment_id);

  return null;
}

/**
 * POST /api/shipped/scan-out — the dock "scan out the label" event.
 *
 * Records that a packed package physically left the building (SHIP_CONFIRM on
 * station_activity_logs), stamping the "left the warehouse" time onto the
 * tracking number's timeline. This is the second, separate scan from pack-out:
 * pack = "in the box", scan-out = "gone". It is NOT the carrier custody signal
 * (that arrives later on shipping_tracking_numbers via webhook/poll).
 *
 * Append-only + idempotent: a package leaves once, so a second scan of the same
 * label returns the existing event rather than duplicating it.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const raw = String(
      (body?.trackingNumber ?? body?.tracking ?? body?.scan ?? '') as string,
    ).trim();

    if (!raw) {
      return NextResponse.json({ ok: false, error: 'tracking number required' }, { status: 400 });
    }

    // Resolve the scan to an existing shipment (registers/syncs a recognized
    // carrier tracking the same way the pack station does).
    let shipmentId = (await resolveShipmentId(raw, ctx.organizationId)).shipmentId;
    // Registry miss → try the orders table + orders_exceptions hold-bucket
    // (legacy / non-carrier labels), self-healing a shipment when an order has none.
    if (shipmentId == null) {
      shipmentId = await resolveShipmentViaOrderOrException(raw, ctx.organizationId);
    }
    if (shipmentId == null) {
      return NextResponse.json(
        { ok: true, matched: false, message: 'No shipment found for this label' },
        { status: 200 },
      );
    }

    // Light context for the toast / running list (best-effort). Also pull the
    // carrier status so we can flag scanning out an already-delivered package.
    const ctxRow = await tenantQuery(
      orgId,
      `SELECT stn.tracking_number_raw    AS tracking,
                stn.latest_status_category AS latest_status_category,
                stn.is_terminal            AS is_terminal,
                o.id                    AS order_row_id,
                o.order_id              AS order_id,
                o.product_title         AS product_title,
                o.sku                   AS sku,
                o.item_number           AS item_number,
                o.condition             AS condition,
                o.quantity              AS quantity,
                o.account_source        AS account_source
         FROM shipping_tracking_numbers stn
         LEFT JOIN orders o ON o.shipment_id = stn.id
         WHERE stn.id = $1
         ORDER BY o.id DESC
         LIMIT 1`,
      [shipmentId],
    )
      .then((r) => r.rows[0] ?? null)
      .catch(() => null);

    const cartonPayload = {
      shipmentId,
      tracking: (ctxRow?.tracking as string | null) ?? raw,
      orderRowId: ctxRow?.order_row_id != null ? Number(ctxRow.order_row_id) : null,
      orderId: (ctxRow?.order_id as string | null) ?? null,
      productTitle: (ctxRow?.product_title as string | null) ?? null,
      sku: (ctxRow?.sku as string | null) ?? null,
      itemNumber: (ctxRow?.item_number as string | null) ?? null,
      condition: (ctxRow?.condition as string | null) ?? null,
      quantity: ctxRow?.quantity != null ? Number(ctxRow.quantity) : null,
      accountSource: (ctxRow?.account_source as string | null) ?? null,
    };

    // Exception: the carrier already reports this package DELIVERED. Scanning it
    // out at the dock is anomalous (wrong/returned package, or a data conflict),
    // so block the SHIP_CONFIRM and surface it as a red exception instead of a
    // green "Out". Mirrors deriveOutboundState's delivered test (DELIVERED, or a
    // terminal status that isn't RETURNED).
    const statusCat = String(ctxRow?.latest_status_category ?? '').toUpperCase();
    const alreadyDelivered =
      statusCat === 'DELIVERED' || (ctxRow?.is_terminal === true && statusCat !== 'RETURNED');
    if (alreadyDelivered) {
      return NextResponse.json({
        ok: true,
        matched: true,
        alreadyDelivered: true,
        ...cartonPayload,
        message: 'Already delivered — scan-out blocked',
      });
    }

    // Idempotency: a package leaves once. Return the existing event if present.
    const existing = await tenantQuery(
      orgId,
      `SELECT id, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at, staff_id
       FROM station_activity_logs
       WHERE activity_type = 'SHIP_CONFIRM' AND shipment_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [shipmentId],
    );
    if (existing.rows[0]) {
      return NextResponse.json({
        ok: true,
        matched: true,
        duplicate: true,
        shipConfirmedAt: existing.rows[0].created_at,
        ...cartonPayload,
      });
    }

    const createdAt = body?.createdAt ? normalizePSTTimestamp(body.createdAt as string) : null;
    const activityId = await createStationActivityLog(pool, {
      organizationId: ctx.organizationId,
      station: 'OUTBOUND',
      activityType: 'SHIP_CONFIRM',
      staffId: ctx.staffId,
      shipmentId,
      scanRef: raw,
      notes: 'Scanned out at dock',
      metadata: { source: 'shipped-scan-out' },
      createdAt,
    });

    // Audit: the package physically left the warehouse (mirrors packing-logs PACK_COMPLETED).
    await recordAudit(pool, ctx, req, {
      source: 'api.shipped.scan-out',
      action: AUDIT_ACTION.SHIP_CONFIRM_SCAN,
      entityType: AUDIT_ENTITY.SHIPMENT,
      entityId: String(shipmentId),
      stationActivityLogId: activityId,
      extra: {
        tracking: ctxRow?.tracking ?? raw,
        order_id: ctxRow?.order_id ?? null,
      },
    });

    // Close the ship gap for units that reached the dock without /api/pack/ship:
    // best-effort mirror open allocations → SHIPPED (idempotent via transition()).
    // Never fail the scan-out SAL write if the mirror no-ops or errors.
    if (activityId != null) {
      await mirrorLegacyPackToAllocations(
        {
          packerLogId: activityId,
          shipmentId,
          actorStaffId: ctx.staffId,
        },
        orgId as OrgId,
      ).catch(() => null);
    }

    // Bust the shipped/packer-logs cache so the two tables reflect the move.
    await invalidateCacheTags(['packing-logs', 'shipped']).catch(() => {});

    return NextResponse.json({
      ok: true,
      matched: true,
      duplicate: false,
      activityId,
      ...cartonPayload,
    });
  },
  { permission: 'shipping.mark_shipped' },
);

/**
 * DELETE /api/shipped/scan-out — undo a dock scan-out.
 *
 * Removes the SHIP_CONFIRM event for a shipment so the package falls back to
 * PACKED_STAGED (still packed, not yet out). Used by the station's "Undo" right
 * after a scan. Safe: audit_logs.station_activity_log_id is ON DELETE SET NULL,
 * so the audit trail of the scan survives with a nulled reference.
 */
export const DELETE = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const shipmentId = Number(body?.shipmentId);
    if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
      return NextResponse.json({ ok: false, error: 'shipmentId required' }, { status: 400 });
    }

    const deleted = await tenantQuery(
      orgId,
      `DELETE FROM station_activity_logs
       WHERE activity_type = 'SHIP_CONFIRM' AND shipment_id = $1`,
      [shipmentId],
    );

    await invalidateCacheTags(['packing-logs', 'shipped']).catch(() => {});

    return NextResponse.json({ ok: true, undone: deleted.rowCount ?? 0, shipmentId });
  },
  { permission: 'shipping.mark_shipped' },
);
