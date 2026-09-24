import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { acknowledgeOrder, unacknowledgeOrder } from '@/lib/orders/order-acknowledgment';
import { outboundFulfillmentRouteSchema } from '@/lib/outbound/work-contract';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import pool from '@/lib/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Outbound Triage acknowledgment for one order.
 *
 *   POST   — acknowledge on a route (`{ route: 'PICK' | 'QC' }`)   (orders.create)
 *   DELETE — undo: clear the acknowledgment                        (orders.create)
 *
 * POST refuses `409 { error: 'NOT_READY', missing: ('pairing' | 'label')[] }`
 * while the order is unpaired to the SKU catalog and/or has no live shipping
 * label (the live-label definition the Triage board shows). Re-acknowledging
 * keeps the first who/when and changes only the route.
 */

const AcknowledgeBody = z.object({ route: outboundFulfillmentRouteSchema }).strict();

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function afterChange(organizationId: OrgId, orderId: number, source: string) {
  // Busts BOTH the legacy `_global` /api/orders cache and the org-scoped one;
  // the To-ship desk reads the former, the Triage board the live projection.
  await invalidateAllOrdersApiCaches([], organizationId);
  await publishOrderChanged({ organizationId, orderIds: [orderId], source });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });

    const parsed = parseBody(AcknowledgeBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const result = await acknowledgeOrder({
      orderId: id,
      organizationId: gate.ctx.organizationId,
      route: parsed.route,
      staffId: gate.ctx.staffId ?? null,
    });
    if (!result.ok) {
      return result.reason === 'not_found'
        ? NextResponse.json({ error: 'Order not found' }, { status: 404 })
        : NextResponse.json({ error: 'NOT_READY', missing: result.missing }, { status: 409 });
    }

    await afterChange(gate.ctx.organizationId, id, 'orders.acknowledge');
    await recordAudit(pool, gate.ctx, req, {
      source: 'outbound-triage',
      action: AUDIT_ACTION.ORDER_ACKNOWLEDGED,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: id,
      before: { acknowledgedAt: result.before.acknowledgedAt, route: result.before.route },
      after: { acknowledgedAt: result.after.acknowledgedAt, route: result.after.route },
    });

    const { orderId, acknowledgedAt, acknowledgedBy, route } = result.after;
    return NextResponse.json({ data: { orderId, acknowledgedAt, acknowledgedBy, route } });
  } catch (error: unknown) {
    console.error('[POST /api/orders/[id]/acknowledge] error:', error);
    return NextResponse.json(
      { error: 'Failed to acknowledge order', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });

    const result = await unacknowledgeOrder({ orderId: id, organizationId: gate.ctx.organizationId });
    if (!result.ok) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    await afterChange(gate.ctx.organizationId, id, 'orders.unacknowledge');
    await recordAudit(pool, gate.ctx, req, {
      source: 'outbound-triage',
      action: AUDIT_ACTION.ORDER_UNACKNOWLEDGED,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: id,
      before: { acknowledgedAt: result.before.acknowledgedAt, route: result.before.route },
      after: { acknowledgedAt: null, route: null },
    });

    const { orderId, acknowledgedAt, acknowledgedBy, route } = result.after;
    return NextResponse.json({ data: { orderId, acknowledgedAt, acknowledgedBy, route } });
  } catch (error: unknown) {
    console.error('[DELETE /api/orders/[id]/acknowledge] error:', error);
    return NextResponse.json(
      { error: 'Failed to undo order acknowledgment', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
