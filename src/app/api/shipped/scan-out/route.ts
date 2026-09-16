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
import { emitIdentificationCompleted } from '@/lib/automations/emit-identification-completed';
import {
  identificationFromScanOut,
  type ScanOutCartonJson,
} from '@/lib/identification';
import {
  isScanOutCreatedAtInWindow,
  parseScanOutStaffId,
  scanOutMaxBackdateMs,
} from '@/lib/outbound/scan-out-desk-stamp';
import { productImageUrl } from '@/lib/photos/product-image-url';

/**
 * Order states that must never leave the building.
 *
 * `canceled` is the spelling `orders.status` actually carries (`mapAmazonStatus`
 * maps Amazon's `Canceled` and `Unfulfillable` onto it) — a set, so adding a
 * hold state later is one entry rather than a new branch.
 */
const BLOCKED_ORDER_STATUSES = new Set(['canceled', 'cancelled']);

function queueScanOutIdentificationCompleted(
  organizationId: string,
  actorStaffId: number | null | undefined,
  json: ScanOutCartonJson,
  clientEventId: string,
): void {
  try {
    const result = identificationFromScanOut({
      source: 'scan',
      organizationId,
      clientEventId,
      json,
    });
    void emitIdentificationCompleted({
      organizationId,
      result,
      actorStaffId: typeof actorStaffId === 'number' && actorStaffId > 0 ? actorStaffId : null,
    }).catch((err) => {
      console.error('[POST /api/shipped/scan-out] identification.completed', err);
    });
  } catch (err) {
    console.error('[POST /api/shipped/scan-out] identification map', err);
  }
}

/** The unit's photo — {@link productImageUrl}, over this query's column names. */
function scanOutImageUrl(row: Record<string, unknown> | null | undefined): string | null {
  return productImageUrl({
    zohoItemId: row?.zoho_item_id as string | null | undefined,
    zohoImageDocumentId: row?.zoho_image_document_id as string | null | undefined,
    catalogImageUrl: row?.catalog_image_url as string | null | undefined,
  });
}

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
                o.account_source        AS account_source,
                o.status                AS order_status,
                sc.image_url            AS catalog_image_url,
                zi.zoho_item_id         AS zoho_item_id,
                zi.image_document_id    AS zoho_image_document_id,
                (SELECT r.id
                   FROM receiving_carton r
                  WHERE r.shipment_id = stn.id
                    AND r.organization_id = stn.organization_id
                  ORDER BY r.id DESC
                  LIMIT 1)              AS receiving_id
         FROM shipping_tracking_numbers stn
         LEFT JOIN orders o ON o.shipment_id = stn.id
         -- Same catalog join /api/orders uses for catalog_image_url: the photo
         -- lives on sku_catalog, never on orders.
         LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
         -- Zoho is the SoT for a unit's photo (operator 2026-09-05). The items
         -- table is the local Zoho mirror, keyed by SKU; the bytes are cached in
         -- zoho_item_images and served by /api/zoho/items/[id]/image.
         -- NB: no backticks in SQL comments — this is a JS template literal.
         LEFT JOIN items zi
                ON zi.sku = o.sku
               AND zi.organization_id = o.organization_id
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
      receivingId: ctxRow?.receiving_id != null ? Number(ctxRow.receiving_id) : null,
      orderRowId: ctxRow?.order_row_id != null ? Number(ctxRow.order_row_id) : null,
      orderId: (ctxRow?.order_id as string | null) ?? null,
      productTitle: (ctxRow?.product_title as string | null) ?? null,
      sku: (ctxRow?.sku as string | null) ?? null,
      itemNumber: (ctxRow?.item_number as string | null) ?? null,
      condition: (ctxRow?.condition as string | null) ?? null,
      quantity: ctxRow?.quantity != null ? Number(ctxRow.quantity) : null,
      accountSource: (ctxRow?.account_source as string | null) ?? null,
      imageUrl: scanOutImageUrl(ctxRow),
      orderStatus: (ctxRow?.order_status as string | null) ?? null,
    };
    const clientEventId =
      String((body as { clientEventId?: unknown })?.clientEventId ?? '').trim() ||
      `scan:scan_out:${shipmentId}`;

    /**
     * Precondition: the order must still be one we are allowed to ship.
     *
     * Nothing checked this. Any label that RESOLVED committed a departure —
     * including a cancelled order whose box was still sitting on the dock,
     * which is the single most expensive mistake this station can make, because
     * the package leaves and the money has already gone back to the customer.
     *
     * `canceled` is the local vocabulary (see `mapAmazonStatus`), not a guess.
     * The block is a refusal, not a warning: the operator is holding the box
     * and needs to be told to put it down.
     */
    const orderStatus = String(ctxRow?.order_status ?? '').trim().toLowerCase();
    if (BLOCKED_ORDER_STATUSES.has(orderStatus)) {
      const json = {
        ok: true,
        matched: true,
        blocked: true,
        blockReason: orderStatus,
        ...cartonPayload,
        message: 'Order is cancelled — do not ship. Pull this package.',
      };
      queueScanOutIdentificationCompleted(orgId, ctx.staffId, json, clientEventId);
      return NextResponse.json(json);
    }

    // Exception: the carrier already reports this package DELIVERED. Scanning it
    // out at the dock is anomalous (wrong/returned package, or a data conflict),
    // so block the SHIP_CONFIRM and surface it as a red exception instead of a
    // green "Out". Mirrors deriveOutboundState's delivered test (DELIVERED, or a
    // terminal status that isn't RETURNED).
    const statusCat = String(ctxRow?.latest_status_category ?? '').toUpperCase();
    const alreadyDelivered =
      statusCat === 'DELIVERED' || (ctxRow?.is_terminal === true && statusCat !== 'RETURNED');
    if (alreadyDelivered) {
      const json = {
        ok: true,
        matched: true,
        alreadyDelivered: true,
        ...cartonPayload,
        message: 'Already delivered — scan-out blocked',
      };
      queueScanOutIdentificationCompleted(orgId, ctx.staffId, json, clientEventId);
      return NextResponse.json(json);
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
      const json = {
        ok: true,
        matched: true,
        duplicate: true,
        shipConfirmedAt: existing.rows[0].created_at,
        ...cartonPayload,
      };
      queueScanOutIdentificationCompleted(orgId, ctx.staffId, json, clientEventId);
      return NextResponse.json(json);
    }

    /**
     * Backdating, bounded.
     *
     * The offline outbox legitimately needs it: a package that left at 08:12
     * during a wifi dropout must be recorded at 08:12, not whenever the radio
     * came back. Desk selection may name a day within 90 days. Anything outside
     * the window is dropped and the server clock is used.
     */
    const createdAt = (() => {
      const raw = body?.createdAt;
      if (!isScanOutCreatedAtInWindow(raw, Date.now(), scanOutMaxBackdateMs(body?.source))) {
        return null;
      }
      return normalizePSTTimestamp(String(raw));
    })();

    const requestedStaffId = parseScanOutStaffId(
      (body as { staffId?: unknown })?.staffId,
    );
    let actorStaffId = ctx.staffId;
    if (requestedStaffId != null && requestedStaffId !== ctx.staffId) {
      const staffRow = await tenantQuery(
        orgId,
        `SELECT id FROM staff WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [requestedStaffId, orgId],
      );
      if (!staffRow.rows[0]) {
        return NextResponse.json(
          { ok: false, error: 'Staff is not in this organization' },
          { status: 400 },
        );
      }
      actorStaffId = requestedStaffId;
    }

    const deskSelection = body?.source === 'desk-selection';
    const activityId = await createStationActivityLog(pool, {
      organizationId: ctx.organizationId,
      station: 'OUTBOUND',
      activityType: 'SHIP_CONFIRM',
      staffId: actorStaffId,
      shipmentId,
      scanRef: raw,
      notes: deskSelection ? 'Marked as shipped from selection' : 'Scanned out at dock',
      metadata: {
        source: 'shipped-scan-out',
        ...(deskSelection ? { deskSelection: true } : null),
      },
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

    const json = {
      ok: true,
      matched: true,
      duplicate: false,
      activityId,
      ...cartonPayload,
    };
    queueScanOutIdentificationCompleted(orgId, actorStaffId, json, clientEventId);
    return NextResponse.json(json);
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
/**
 * GET /api/shipped/scan-out — what this operator already sent out.
 *
 * The phone station keeps a session tape in memory, which is the right shape
 * while scanning and the wrong one the moment the operator reloads, hands the
 * phone over, or comes back after a break: the shift's work is simply gone.
 * This is the durable half — SHIP_CONFIRM events, newest first, joined to the
 * same carton context a live scan returns so a history row and a fresh row are
 * the same shape and can share one component.
 *
 * Scoped to the CALLING STAFF by default (`?scope=mine`), because "what have I
 * scanned out" is the question the station asks. `scope=all` is the dock view.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const faceOrderId = String(url.searchParams.get('orderId') ?? '').trim();
    if (faceOrderId) {
      const numericId = Number(faceOrderId);
      const row = await tenantQuery(
        ctx.organizationId,
        `SELECT o.id                    AS order_row_id,
                o.order_id              AS order_id,
                o.product_title         AS product_title,
                o.sku                   AS sku,
                o.item_number           AS item_number,
                o.condition             AS condition,
                o.quantity              AS quantity,
                o.account_source        AS account_source,
                o.status                AS order_status,
                o.shipping_tracking_number AS tracking,
                o.shipment_id           AS shipment_id,
                sc.image_url            AS catalog_image_url,
                zi.zoho_item_id         AS zoho_item_id,
                zi.image_document_id    AS zoho_image_document_id,
                (SELECT r.id
                   FROM receiving_carton r
                  WHERE r.shipment_id = o.shipment_id
                    AND r.organization_id = o.organization_id
                  ORDER BY r.id DESC
                  LIMIT 1)              AS receiving_id,
                EXISTS (
                  SELECT 1 FROM station_activity_logs sal
                   WHERE sal.activity_type = 'SHIP_CONFIRM'
                     AND sal.shipment_id = o.shipment_id
                     AND sal.organization_id = o.organization_id
                ) AS already_confirmed
           FROM orders o
           LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
           LEFT JOIN items zi
                  ON zi.sku = o.sku
                 AND zi.organization_id = o.organization_id
          WHERE o.organization_id = $1
            AND (
              o.order_id = $2
              OR ($3::bigint IS NOT NULL AND o.id = $3)
            )
          ORDER BY o.id DESC
          LIMIT 1`,
        [
          ctx.organizationId,
          faceOrderId,
          Number.isFinite(numericId) && numericId > 0 ? numericId : null,
        ],
      )
        .then((r) => r.rows[0] ?? null)
        .catch(() => null);

      if (!row) {
        return NextResponse.json({
          ok: true,
          matched: false,
          organizationId: ctx.organizationId,
          message: 'No order found',
        });
      }

      const orderStatus = String(row.order_status ?? '').trim().toLowerCase();
      const blocked = BLOCKED_ORDER_STATUSES.has(orderStatus);
      const alreadyConfirmed = row.already_confirmed === true || row.already_confirmed === 't';
      return NextResponse.json({
        ok: true,
        matched: true,
        organizationId: ctx.organizationId,
        blocked,
        blockReason: blocked ? orderStatus : null,
        duplicate: alreadyConfirmed && !blocked,
        shipmentId: row.shipment_id != null ? Number(row.shipment_id) : null,
        tracking: (row.tracking as string | null) ?? null,
        receivingId: row.receiving_id != null ? Number(row.receiving_id) : null,
        orderRowId: row.order_row_id != null ? Number(row.order_row_id) : null,
        orderId: (row.order_id as string | null) ?? null,
        productTitle: (row.product_title as string | null) ?? null,
        sku: (row.sku as string | null) ?? null,
        itemNumber: (row.item_number as string | null) ?? null,
        condition: (row.condition as string | null) ?? null,
        quantity: row.quantity != null ? Number(row.quantity) : null,
        accountSource: (row.account_source as string | null) ?? null,
        imageUrl: scanOutImageUrl(row),
        orderStatus: (row.order_status as string | null) ?? null,
        message: blocked ? 'Order is cancelled — do not ship. Pull this package.' : null,
      });
    }

    const scopeAll = url.searchParams.get('scope') === 'all';
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 25), 1), 100);

    const rows = await tenantQuery(
      ctx.organizationId,
      `SELECT sal.id,
              -- UTC with a literal Z, never the OF pattern. Postgres renders OF
              -- as -07 (hours only), which JS Date cannot parse: the stamp came
              -- back Invalid Date and every history row rendered with a blank
              -- time while live rows showed one.
              -- NB: no backticks in this comment. It lives inside a JS template
              -- literal, so one would terminate the string.
              to_char(sal.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS confirmed_at,
              sal.shipment_id,
              sal.staff_id,
              st.name                 AS staff_name,
              stn.tracking_number_raw AS tracking,
              o.order_id              AS order_id,
              o.product_title         AS product_title,
              o.sku                   AS sku,
              o.condition             AS condition,
              o.quantity              AS quantity,
              sc.image_url            AS catalog_image_url,
              zi.zoho_item_id         AS zoho_item_id,
              zi.image_document_id    AS zoho_image_document_id
         FROM station_activity_logs sal
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = sal.shipment_id
         LEFT JOIN orders o ON o.shipment_id = sal.shipment_id
         LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
         LEFT JOIN items zi
                ON zi.sku = o.sku
               AND zi.organization_id = o.organization_id
         LEFT JOIN staff st ON st.id = sal.staff_id
        WHERE sal.activity_type = 'SHIP_CONFIRM'
          AND sal.organization_id = $1
          AND ($2::int IS NULL OR sal.staff_id = $2)
        ORDER BY sal.created_at DESC
        LIMIT $3`,
      [ctx.organizationId, scopeAll ? null : ctx.staffId, limit],
    )
      .then((r) => ({ rows: r.rows, failed: false }))
      // An empty shift and a failed query are NOT the same answer. Returning
      // `entries: []` for both told the operator they had scanned nothing all
      // day whenever the database hiccuped.
      .catch(() => ({ rows: [] as Record<string, unknown>[], failed: true }))
      .then((r) => (r.failed ? null : r.rows));

    if (rows === null) {
      return NextResponse.json(
        { ok: false, error: 'history unavailable' },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      scope: scopeAll ? 'all' : 'mine',
      entries: rows.map((row) => ({
        id: Number(row.id),
        shipmentId: row.shipment_id != null ? Number(row.shipment_id) : null,
        confirmedAt: (row.confirmed_at as string | null) ?? null,
        // Recorded since day one and never surfaced. "Who scanned this out"
        // is the question a dock asks when a package cannot be found.
        staffId: row.staff_id != null ? Number(row.staff_id) : null,
        staffName: (row.staff_name as string | null) ?? null,
        tracking: (row.tracking as string | null) ?? null,
        orderId: (row.order_id as string | null) ?? null,
        productTitle: (row.product_title as string | null) ?? null,
        sku: (row.sku as string | null) ?? null,
        condition: (row.condition as string | null) ?? null,
        quantity: row.quantity != null ? Number(row.quantity) : null,
        imageUrl: scanOutImageUrl(row),
      })),
    });
  },
  { permission: 'shipping.mark_shipped' },
);

/**
 * How far back a scan-out can be taken back from the floor.
 *
 * An undo is a CORRECTION — "that was the wrong box, seconds ago" — not a
 * general-purpose history editor. Unbounded, it let a phone delete a departure
 * recorded on a previous shift by someone else, which is the opposite of what a
 * dock's records are for. Anything older is a supervisor's job on the desk,
 * where there is a record and a reason.
 */
const UNDO_WINDOW_MINUTES = 120;

/**
 * DELETE /api/shipped/scan-out — take back a scan-out this operator just made.
 *
 * Three things this deliberately does NOT do, each of which it used to:
 *
 *  1. **Delete other people's work.** Scoped to the calling staff. A dock runs
 *     several phones; one operator undoing another's confirm — silently, with
 *     no trace — is a lost package nobody can explain.
 *  2. **Reach back indefinitely.** Bounded by {@link UNDO_WINDOW_MINUTES}.
 *  3. **Go unaudited.** The commit path writes an audit row; the reversal wrote
 *     nothing at all, and deleting the activity log nulled the original row's
 *     `station_activity_log_id` — so an undo erased its own evidence. It is now
 *     audited BEFORE the delete, carrying what was removed.
 *
 * Returns `undone: 0` with a reason when nothing matched, so the client can say
 * why rather than silently doing nothing.
 */
export const DELETE = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const shipmentId = Number(body?.shipmentId);
    if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
      return NextResponse.json({ ok: false, error: 'shipmentId required' }, { status: 400 });
    }

    // Find the candidate FIRST, so the audit row can describe what was removed
    // and the refusal can say which rule stopped it.
    const candidate = await tenantQuery<{
      id: number;
      staff_id: number | null;
      created_at: string;
      age_minutes: number;
    }>(
      orgId,
      `SELECT id, staff_id,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              EXTRACT(EPOCH FROM (now() - created_at)) / 60 AS age_minutes
         FROM station_activity_logs
        WHERE activity_type = 'SHIP_CONFIRM'
          AND shipment_id = $1
          AND organization_id = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [shipmentId, orgId],
    )
      .then((r) => r.rows[0] ?? null)
      .catch(() => null);

    if (!candidate) {
      return NextResponse.json({ ok: true, undone: 0, reason: 'not_found', shipmentId });
    }
    if (candidate.staff_id != null && Number(candidate.staff_id) !== Number(ctx.staffId)) {
      return NextResponse.json(
        { ok: false, undone: 0, reason: 'not_yours', shipmentId },
        { status: 403 },
      );
    }
    if (Number(candidate.age_minutes) > UNDO_WINDOW_MINUTES) {
      return NextResponse.json(
        { ok: false, undone: 0, reason: 'too_old', shipmentId },
        { status: 409 },
      );
    }

    // Audited before the row is gone: deleting the activity log nulls the FK on
    // the commit's own audit row, so this is the only durable record that the
    // departure was taken back, by whom, and when.
    await recordAudit(pool, ctx, req, {
      source: 'api.shipped.scan-out',
      action: AUDIT_ACTION.SHIP_CONFIRM_UNDO,
      entityType: AUDIT_ENTITY.SHIPMENT,
      entityId: String(shipmentId),
      extra: {
        undone_activity_id: candidate.id,
        undone_confirmed_at: candidate.created_at,
        undone_staff_id: candidate.staff_id,
      },
    }).catch(() => null);

    const deleted = await tenantQuery(
      orgId,
      `DELETE FROM station_activity_logs
        WHERE activity_type = 'SHIP_CONFIRM'
          AND shipment_id = $1
          AND organization_id = $2
          AND id = $3`,
      [shipmentId, orgId, candidate.id],
    );

    await invalidateCacheTags(['packing-logs', 'shipped']).catch(() => {});

    return NextResponse.json({ ok: true, undone: deleted.rowCount ?? 0, shipmentId });
  },
  { permission: 'shipping.mark_shipped' },
);
