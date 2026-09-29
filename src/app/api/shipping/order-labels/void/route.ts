import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { getShipStationV2, ShipStationNotConnectedError } from '@/lib/shipping/shipstation/config';
import { ShipStationApiError } from '@/lib/shipping/shipstation/client';
import { voidOrderLabel } from '@/lib/shipping/order-label-purchase';

export const dynamic = 'force-dynamic';

/** POST /api/shipping/order-labels/void */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  try {
    const body = await req.json().catch(() => null);
    const orderId = Number(body?.orderId);
    const labelId = String(body?.labelId || '').trim();
    const reason = String(body?.reason || '').trim();
    const shipmentId = Number(body?.shipmentId);
    const documentId = Number(body?.documentId);

    if (!Number.isFinite(orderId) || orderId <= 0) throw ApiError.badRequest('Valid orderId is required');
    if (!labelId) throw ApiError.badRequest('labelId is required');
    if (!reason) throw ApiError.badRequest('A reason is required to void a label');

    const owner = await tenantQuery<{ id: number }>(
      orgId,
      `SELECT id FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [orderId, orgId],
    );
    if (owner.rows.length === 0) throw ApiError.notFound('order', orderId);

    const v2 = await getShipStationV2(orgId);
    const result = await voidOrderLabel(orgId, v2, {
      orderId,
      labelId,
      shipmentId: Number.isFinite(shipmentId) && shipmentId > 0 ? shipmentId : null,
      documentId: Number.isFinite(documentId) && documentId > 0 ? documentId : null,
    });
    if (!result.approved) {
      return NextResponse.json(
        { ok: false, approved: false, error: result.message || 'The carrier declined the void request.' },
        { status: 409 },
      );
    }

    await recordAudit(pool, ctx, req, {
      source: 'api.outbound.labels.void',
      action: AUDIT_ACTION.LABEL_VOIDED,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderId,
      reasonCode: reason,
      before: { labelId },
      extra: {
        shipmentId: Number.isFinite(shipmentId) ? shipmentId : null,
        documentId: Number.isFinite(documentId) ? documentId : null,
        removedLabelIngestionIds: result.removedLabelIngestionIds,
      },
    });

    after(async () => {
      try {
        await invalidateCacheTags(['orders', 'shipped', 'orders-next']);
        await publishOrderChanged({ organizationId: orgId, orderIds: [orderId], source: 'outbound.void-label' });
      } catch (e) {
        console.warn('[void-label] realtime/cache failed', e);
      }
    });

    return NextResponse.json({ ok: true, approved: true, message: result.message });
  } catch (error) {
    if (error instanceof ShipStationNotConnectedError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: 'SHIPSTATION_NOT_CONNECTED' },
        { status: 400 },
      );
    }
    if (error instanceof ShipStationApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.isNotConnected ? 400 : 502 });
    }
    return errorResponse(error, 'POST /api/shipping/order-labels/void');
  }
}, { permission: 'shipping.void_label' });
