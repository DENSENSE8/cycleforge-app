import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { hasStepUp } from '@/lib/auth/stepup';
import { rolesIncludeAdmin } from '@/lib/auth/permissions-shared';
import {
  getOrderById,
  updateOrder,
  deleteOrder,
  OrderDeleteBlockedError,
} from '@/lib/neon/orders-queries';
import { parseBody } from '@/lib/schemas/parse';
import { OrderUpdateBody } from '@/lib/schemas/orders';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/** Canonical record route for a single order. */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.view');
    if (gate.denied) return gate.denied;
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const order = await getOrderById(id, gate.ctx.organizationId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    console.error('[GET /api/orders/[id]] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order', details: error?.message },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(OrderUpdateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const before = await getOrderById(id, gate.ctx.organizationId);
    if (!before) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const updated = await updateOrder(id, parsed, gate.ctx.organizationId);
    if (!updated) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    await invalidateAllOrdersApiCaches(['shipped', 'packing-logs'], gate.ctx.organizationId);
    await publishOrderChanged({ organizationId: gate.ctx.organizationId, orderIds: [id], source: 'orders.update' });

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-api',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: id,
      before: { ...before },
      after: { ...updated },
    });

    return NextResponse.json({ success: true, order: updated });
  } catch (error: any) {
    console.error('[PATCH /api/orders/[id]] error:', error);
    return NextResponse.json(
      { error: 'Failed to update order', details: error?.message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.void');
    if (gate.denied) return gate.denied;

    // orders.void is permission-derived step-up. Auth-only dogfood mode bypasses
    // that authorization prompt; strict mode keeps the existing admin exemption.
    if (
      gate.ctx.authorizationMode === 'strict' &&
      !rolesIncludeAdmin(gate.ctx.user.roles)
    ) {
      const granted = await hasStepUp(gate.ctx.session.sid, 'orders.void');
      if (!granted) {
        return NextResponse.json(
          { error: 'STEPUP_REQUIRED', scope: 'orders.void', method_hint: 'pin' },
          { status: 403 },
        );
      }
    }

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const before = await getOrderById(id, gate.ctx.organizationId);
    if (!before) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const deleted = await deleteOrder(id, gate.ctx.organizationId, gate.ctx.staffId);
    if (!deleted) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    await invalidateAllOrdersApiCaches(['shipped', 'packing-logs'], gate.ctx.organizationId);
    await publishOrderChanged({ organizationId: gate.ctx.organizationId, orderIds: [id], source: 'orders.delete' });

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-api',
      action: 'orders.delete',
      entityType: AUDIT_ENTITY.ORDER,
      entityId: id,
      before: { ...before },
      after: null,
      method: 'manual',
    });

    return NextResponse.json({ success: true, deleted: 1 });
  } catch (error: any) {
    console.error('[DELETE /api/orders/[id]] error:', error);
    if (error instanceof OrderDeleteBlockedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete order', details: error?.message },
      { status: 500 },
    );
  }
}
