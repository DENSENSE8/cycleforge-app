import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { SupportItemOrdersLinkBody, SupportItemOrdersUnlinkQuery } from '@/lib/schemas/support-orders';
import {
  linkSupportItemOrders,
  SupportOrderLinkError,
  unlinkSupportItemOrder,
} from '@/lib/support/orders/link-orders';
import { readSupportOrderRefs } from '@/lib/support/orders/order-facts';
import { withTenantTransaction } from '@/lib/tenancy/db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function linkErrorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof SupportOrderLinkError) {
    return NextResponse.json(
      { error: err.message, code: err.code, orderIds: err.orderIds },
      { status: err.status },
    );
  }
  console.error(`Error in ${context}:`, err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
}

async function itemIdOf(params: Params['params']): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * POST /api/support/items/[id]/orders — link exact orders (`orders.id`) to
 * the Support item, keeping each pasted reference as metadata; `primary:
 * true` on one link makes it the item's primary order (set primary =
 * `{ links: [{ orderId, primary: true }] }`).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const context = 'POST /api/support/items/[id]/orders';
  const gate = await requireRoutePerm(req, 'support.thread.manage');
  if (gate.denied) return gate.denied;
  const supportItemId = await itemIdOf(params);
  if (supportItemId == null) return NextResponse.json({ error: 'Invalid Support item id' }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const body = parseBody(SupportItemOrdersLinkBody, raw);
  if (body instanceof NextResponse) return body;

  const orgId = gate.ctx.organizationId;
  try {
    const result = await withTenantTransaction(orgId, (client) =>
      linkSupportItemOrders(client, {
        orgId,
        supportItemId,
        links: body.links.map((l) => ({
          orderId: l.orderId,
          primary: l.primary,
          externalReference: l.externalReference ?? null,
        })),
        staffId: gate.ctx.staffId,
      }),
    );
    await recordAudit(pool, gate.ctx, req, {
      source: 'support-item-orders-api',
      action: AUDIT_ACTION.SUPPORT_TICKET_LINKED,
      entityType: AUDIT_ENTITY.SUPPORT_TICKET,
      entityId: supportItemId,
      after: {
        entityType: 'ORDER',
        orderIds: result.linked,
        primaryOrderId: result.primaryOrderId,
        externalReferences: body.links.map((l) => l.externalReference ?? null),
      },
    });
    const orders = await readSupportOrderRefs(orgId, supportItemId);
    return NextResponse.json({ linked: result.linked, primaryOrderId: result.primaryOrderId, orders });
  } catch (err) {
    return linkErrorResponse(err, context);
  }
}

/** DELETE /api/support/items/[id]/orders?orderId= — unlink one order; unlinking the primary promotes the next link. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const context = 'DELETE /api/support/items/[id]/orders';
  const gate = await requireRoutePerm(req, 'support.thread.manage');
  if (gate.denied) return gate.denied;
  const supportItemId = await itemIdOf(params);
  if (supportItemId == null) return NextResponse.json({ error: 'Invalid Support item id' }, { status: 400 });

  const query = parseBody(SupportItemOrdersUnlinkQuery, { orderId: req.nextUrl.searchParams.get('orderId') ?? '' });
  if (query instanceof NextResponse) return query;

  const orgId = gate.ctx.organizationId;
  try {
    const result = await withTenantTransaction(orgId, (client) =>
      unlinkSupportItemOrder(client, { orgId, supportItemId, orderId: query.orderId }),
    );
    if (!result.removed) {
      return NextResponse.json({ error: `Order ${query.orderId} is not linked to this Support item` }, { status: 404 });
    }
    await recordAudit(pool, gate.ctx, req, {
      source: 'support-item-orders-api',
      action: AUDIT_ACTION.SUPPORT_TICKET_UNLINKED,
      entityType: AUDIT_ENTITY.SUPPORT_TICKET,
      entityId: supportItemId,
      before: { entityType: 'ORDER', orderId: query.orderId },
      after: { primaryOrderId: result.primaryOrderId },
    });
    const orders = await readSupportOrderRefs(orgId, supportItemId);
    return NextResponse.json({ removed: true, primaryOrderId: result.primaryOrderId, orders });
  } catch (err) {
    return linkErrorResponse(err, context);
  }
}
