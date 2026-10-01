import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { commitIsPhoneOrigin } from '@/lib/auth/phone-origin.server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { normalizePSTTimestamp } from '@/utils/date';
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
import {
  scanOutBlockedMessage,
  scanOutBlockReason,
  scanOutLabel,
} from '@/lib/outbound/scan-out';
import { productImageUrl } from '@/lib/photos/product-image-url';
import { publishActivityLogged, publishOrderChanged } from '@/lib/realtime/publish';

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

/** POST /api/shipped/scan-out — the dock "scan out the label" event. */
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

    /** Backdating, bounded. */
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
    const mobileScanEventId = Number.isSafeInteger(Number(body?.mobileScanEventId)) && Number(body.mobileScanEventId) > 0
      ? Number(body.mobileScanEventId)
      : null;
    const phoneOrigin = await commitIsPhoneOrigin({
      session: ctx.session,
      organizationId: orgId,
      staffId: ctx.staffId,
      mobileScanEventId,
    });
    let actorStaffId = ctx.staffId;
    if (!phoneOrigin && requestedStaffId != null && requestedStaffId !== ctx.staffId) {
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

    const result = await scanOutLabel({
      organizationId: orgId,
      scan: raw,
      actorStaffId,
      createdAt,
      origin: phoneOrigin
        ? 'phone'
        : body?.source === 'desk-selection'
          ? 'desk-selection'
          : 'dock',
      correlation: phoneOrigin
        ? {
            clientEventId: String(body?.clientEventId ?? '').trim() || null,
            mobileScanEventId,
            surface: String(body?.surface ?? '').trim() || `/m/id/scan-out/${encodeURIComponent(String(body?.orderId ?? ''))}`,
          }
        : undefined,
      auditRequest: { ctx, req },
    });

    if (result.kind === 'unmatched') {
      return NextResponse.json(
        { ok: true, matched: false, message: 'No shipment found for this label' },
        { status: 200 },
      );
    }

    const clientEventId =
      String((body as { clientEventId?: unknown })?.clientEventId ?? '').trim() ||
      `scan:scan_out:${result.carton.shipmentId}`;
    const base = { ok: true, matched: true, ...result.carton };
    const json =
      result.kind === 'blocked'
        ? {
            ...base,
            blocked: true,
            blockReason: result.blockReason,
            message: scanOutBlockedMessage(result.blockReason),
          }
        : result.kind === 'duplicate'
          ? { ...base, duplicate: true, shipConfirmedAt: result.shipConfirmedAt }
          : { ...base, duplicate: false, activityId: result.activityId };
    queueScanOutIdentificationCompleted(
      orgId,
      result.kind === 'confirmed' ? actorStaffId : ctx.staffId,
      json,
      clientEventId,
    );
    if (result.kind === 'confirmed' && result.activityId != null) {
      await publishActivityLogged({
        organizationId: orgId,
        id: result.activityId,
        station: 'OUTBOUND',
        activityType: 'SHIP_CONFIRM',
        staffId: actorStaffId,
        scanRef: raw,
        source: 'shipped-scan-out',
      }).catch(() => {});
    }
    return NextResponse.json(json);
  },
  { permission: 'shipping.mark_shipped' },
);

/** DELETE /api/shipped/scan-out — undo a dock scan-out. */
/** GET /api/shipped/scan-out — what this operator already sent out. */
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
                stn.tracking_number_raw AS tracking,
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
                ) AS already_confirmed,
                EXISTS (
                  SELECT 1 FROM packer_logs pl
                   WHERE pl.organization_id = o.organization_id
                     AND pl.shipment_id = o.shipment_id
                     AND pl.tracking_type = 'ORDERS'
                     AND pl.completion_state = 'COMPLETED'
                ) AS is_packed
           FROM orders o
           LEFT JOIN shipping_tracking_numbers stn
                  ON stn.id = o.shipment_id
                 AND stn.organization_id = o.organization_id
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

      const blockReason = scanOutBlockReason(
        row.order_status,
        row.is_packed === true || row.is_packed === 't',
      );
      const blocked = blockReason != null;
      const alreadyConfirmed = row.already_confirmed === true || row.already_confirmed === 't';
      return NextResponse.json({
        ok: true,
        matched: true,
        organizationId: ctx.organizationId,
        blocked,
        blockReason,
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
        message: blocked ? scanOutBlockedMessage(blockReason!) : null,
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

/** How far back a scan-out can be taken back from the floor. */
const UNDO_WINDOW_MINUTES = 120;

/** DELETE /api/shipped/scan-out — take back a scan-out this operator just made. */
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
      order_row_id: number | null;
      staff_id: number | null;
      created_at: string;
      age_minutes: number;
    }>(
      orgId,
      `SELECT sal.id,
              o.id AS order_row_id,
              sal.staff_id,
              to_char(sal.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              EXTRACT(EPOCH FROM (now() - sal.created_at)) / 60 AS age_minutes
         FROM station_activity_logs sal
         LEFT JOIN orders o ON o.shipment_id = sal.shipment_id
        WHERE sal.activity_type = 'SHIP_CONFIRM'
          AND sal.shipment_id = $1
          AND sal.organization_id = $2
        ORDER BY sal.created_at DESC
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

    await invalidateCacheTags(orgId, ['packing-logs', 'shipped']).catch(() => {});
    if (candidate.order_row_id != null) {
      await publishOrderChanged({
        organizationId: orgId,
        orderIds: [Number(candidate.order_row_id)],
        source: 'shipping.scan-out',
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, undone: deleted.rowCount ?? 0, shipmentId });
  },
  { permission: 'shipping.mark_shipped' },
);
