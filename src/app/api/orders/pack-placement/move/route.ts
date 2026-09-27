import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';
import {
  moveOrderPackPlacement,
  PackPlacementError,
  type OrderPackPlacement,
} from '@/lib/packing/pack-placement';
import { parseBody } from '@/lib/schemas/parse';
import { PackPlacementMoveBody } from '@/lib/schemas/pack-placement';
import { normalizeTrackingNumber } from '@/lib/tracking-format';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';

const ROUTE = 'orders.pack-placement.move';

/**
 * POST /api/orders/pack-placement/move — move a ready-to-pack order between
 * packing DESK / STAGING locations. Does not change TESTED lifecycle.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const canWrite =
      ctx.permissions.has('picking.scan') || ctx.permissions.has('packing.view');
    if (!canWrite) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', permission: 'picking.scan|packing.view' },
        { status: 403 },
      );
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(PackPlacementMoveBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const idemKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
    if (idemKey) {
      const hit = await getApiIdempotencyResponse(
        pool,
        ctx.organizationId,
        idemKey,
        ROUTE,
      );
      if (hit) return NextResponse.json(hit.response_body, { status: hit.status_code });
    }

    let orderId = parsed.orderId ?? null;
    if (orderId == null && parsed.tracking) {
      const tracking = normalizeTrackingNumber(parsed.tracking);
      orderId = await withTenantTransaction(ctx.organizationId, async (client) => {
        const r = await client.query<{ id: number }>(
          `SELECT o.id
             FROM orders o
             JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
            WHERE o.organization_id = $1
              AND (
                BTRIM(COALESCE(stn.tracking_number_raw, '')) = $2
                OR RIGHT(REGEXP_REPLACE(UPPER(COALESCE(stn.tracking_number_raw, '')), '[^A-Z0-9]', '', 'g'), 18) =
                   RIGHT(REGEXP_REPLACE(UPPER($2), '[^A-Z0-9]', '', 'g'), 18)
              )
            ORDER BY o.id DESC
            LIMIT 1`,
          [ctx.organizationId, tracking],
        );
        return r.rows[0] ? Number(r.rows[0].id) : null;
      });
      if (orderId == null) {
        return NextResponse.json(
          { success: false, error: 'Order not found for tracking' },
          { status: 404 },
        );
      }
    }

    const placement: OrderPackPlacement = await moveOrderPackPlacement(ctx.organizationId, {
      orderId: orderId!,
      locationId: parsed.locationId,
      barcode: parsed.barcode,
      staffId: ctx.staffId,
      source: 'move',
      reason: parsed.reason ?? null,
    });

    await recordAudit(pool, ctx, req, {
      source: 'pack-placement-api',
      action: AUDIT_ACTION.ORDER_PACK_MOVE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: placement.orderId,
      after: { ...placement },
    });

    await invalidateCacheTags(['orders', 'orders-next']);
    await invalidateCacheTags(ctx.organizationId, [CACHE_TAGS.orders, CACHE_TAGS.ordersNext]);

    const responseBody: { success: true; placement: OrderPackPlacement } = {
      success: true,
      placement,
    };
    if (idemKey) {
      await saveApiIdempotencyResponse(pool, {
        orgId: ctx.organizationId,
        idempotencyKey: idemKey,
        route: ROUTE,
        staffId: ctx.staffId,
        statusCode: 200,
        responseBody,
      });
    }
    return NextResponse.json(responseBody);
  } catch (error: unknown) {
    if (error instanceof PackPlacementError) {
      const status =
        error.code === 'ORDER_NOT_FOUND' || error.code === 'LOCATION_NOT_FOUND'
          ? 404
          : error.code === 'SAME_LOCATION'
            ? 409
            : 400;
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status },
      );
    }
    console.error('Error in POST /api/orders/pack-placement/move:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Move failed' },
      { status: 500 },
    );
  }
}, { permission: 'orders.view' });
