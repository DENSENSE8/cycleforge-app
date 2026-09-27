import { NextRequest, NextResponse, after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recomputeEnrichmentForOrders } from '@/lib/neon/packer-log-enrichment';
import { getOrderById } from '@/lib/neon/orders-queries';
import { applyOrderTrackingOps, type ApplyOrderTrackingOps } from '@/lib/neon/orders-tracking-queries';
import { parseBody } from '@/lib/schemas/parse';
import { OrderTrackingPostBody, OrderTrackingPatchBody } from '@/lib/schemas/orders';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/** Tracking sub-resource for a single order: */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function statusForError(message: string): number {
  if (message.includes('already exists')) return 409;
  if (message.includes('invalid') || message.includes('required') || message.includes('not linked')) return 400;
  return 500;
}

/**
 * Resolve + org-scope the order, run the tracking batch, then fire the shared
 * cache/realtime/audit side-effects. Returns a NextResponse either way.
 */
async function runTrackingOps(
  req: NextRequest,
  id: number,
  ctx: NonNullable<Awaited<ReturnType<typeof requireRoutePerm>>['ctx']>,
  ops: Omit<ApplyOrderTrackingOps, 'orderIds'>,
): Promise<NextResponse> {
  const before = await getOrderById(id, ctx.organizationId);
  if (!before) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  let result;
  try {
    result = await applyOrderTrackingOps({ orderIds: [id], organizationId: ctx.organizationId, ...ops });
  } catch (error: any) {
    const message = String(error?.message || '');
    console.error('[orders/[id]/tracking] op failed:', error);
    return NextResponse.json(
      { error: 'Failed to update tracking', details: message },
      { status: statusForError(message) },
    );
  }

  await invalidateAllOrdersApiCaches(['shipped', 'orders-next', 'desk-pick-logs', 'packing-logs', 'need-to-order'], ctx.organizationId);
  await publishOrderChanged({ organizationId: ctx.organizationId, orderIds: [id], source: 'orders.tracking' });

  const updated = await getOrderById(id, ctx.organizationId);

  // The order↔tracking linkage just changed, which flips the `order_match` resolution for any already-packed PACK scan on this order.
  after(() =>
    recomputeEnrichmentForOrders(pool, [id]).catch((e) =>
      console.warn('[orders/[id]/tracking] enrichment recompute failed', e),
    ),
  );

  await recordAudit(pool, ctx, req, {
    source: 'orders-api',
    action: AUDIT_ACTION.ORDER_UPDATE,
    entityType: AUDIT_ENTITY.ORDER,
    entityId: id,
    before: { shipment_id: before.shipment_id ?? null },
    after: { shipment_id: updated?.shipment_id ?? null },
    extra: { tracking: ops, createdShipmentIds: result.createdShipmentIds, primaryShipmentId: result.primaryShipmentId },
  });

  return NextResponse.json({ success: true, ...result, order: updated });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(OrderTrackingPostBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  return runTrackingOps(req, id, gate.ctx, {
    primaryTrackingNumber: parsed.trackingNumber,
    creates: parsed.creates,
    setPrimaryShipmentId: parsed.setPrimaryShipmentId,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(OrderTrackingPatchBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  return runTrackingOps(req, id, gate.ctx, {
    setTrackingNumbers: parsed.setTrackingNumbers,
    primaryTrackingNumber: parsed.primaryTrackingNumber,
    edits: parsed.edits,
    creates: parsed.creates,
    deletes: parsed.deletes,
    setPrimaryShipmentId: parsed.setPrimaryShipmentId,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const shipmentId = Number(new URL(req.url).searchParams.get('shipment_id'));
  if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
    return NextResponse.json({ error: 'shipment_id query param is required' }, { status: 400 });
  }

  return runTrackingOps(req, id, gate.ctx, {
    deletes: [{ shipmentId }],
  });
}
