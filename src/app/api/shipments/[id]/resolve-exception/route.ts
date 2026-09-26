import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import pool from '@/lib/db';
import { parseBody } from '@/lib/schemas/parse';
import { ResolveShipmentExceptionBody } from '@/lib/schemas/shipments';
import { resolveShipmentException } from '@/lib/shipments/resolve-shipment-exception';

/**
 * POST /api/shipments/[id]/resolve-exception — resolve the package's open
 * unmatched-scan exception: `link-order` (box → order) or `close` (with a
 * reason). Idempotent on `clientEventId`. Returns the fresh `ShipmentRecord`.
 * Gated like the other orders_exceptions write (`orders.create`).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const shipmentId = Number(rawId);
  if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0) {
    return NextResponse.json({ error: 'Invalid shipment id' }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const body = parseBody(ResolveShipmentExceptionBody, raw);
  if (body instanceof NextResponse) return body;

  try {
    const out = await resolveShipmentException({
      orgId: gate.ctx.organizationId,
      staffId: gate.ctx.staffId ?? null,
      shipmentId,
      body,
    });
    if (out.status !== 200) {
      return NextResponse.json({ error: out.error }, { status: out.status });
    }

    const applied = out.applied;
    if (applied) {
      await invalidateCacheTags(['orders', 'shipped', 'packing-logs']);
      await recordAudit(pool, gate.ctx, req, {
        source: 'shipment-record-api',
        action:
          applied.kind === 'link-order'
            ? AUDIT_ACTION.ORDERS_EXCEPTION_RESOLVE
            : AUDIT_ACTION.ORDERS_EXCEPTION_CLOSE,
        entityType: AUDIT_ENTITY.ORDERS_EXCEPTION,
        entityId: applied.exceptionId,
        before: applied.before,
        after: applied.after,
        reasonCode: applied.kind === 'close' ? 'operator_close' : null,
        note: body.kind === 'close' ? body.reason : null,
        extra: { shipment_id: shipmentId, client_event_id: body.clientEventId },
      });
      if (applied.kind === 'link-order' && applied.orderRowId != null) {
        await recordAudit(pool, gate.ctx, req, {
          source: 'shipment-record-api',
          action: AUDIT_ACTION.TRACKING_ADDED,
          entityType: AUDIT_ENTITY.ORDER,
          entityId: applied.orderRowId,
          after: {
            shipment_id: shipmentId,
            tracking: out.result.record.tracking,
            link_role: applied.linkRole,
            orders_exception_id: applied.exceptionId,
          },
          extra: { client_event_id: body.clientEventId },
        });
      }
    }

    return NextResponse.json(out.result);
  } catch (error) {
    console.error('Error in POST /api/shipments/[id]/resolve-exception:', error);
    return NextResponse.json({ error: 'Failed to resolve the exception' }, { status: 500 });
  }
}
