import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { setOrderFlag } from '@/lib/orders/order-flags';
import { ORDER_ROW_FLAG_IDS } from '@/lib/orders/order-row-flags';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import pool from '@/lib/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';

/**
 * The order's triage flag — the operator-set tag that tints its queue row.
 *
 *   PUT — set or clear the flag (`{ flag: <id> | null }`)   (orders.create)
 *
 * One verb for both directions on purpose: setting and clearing are the same
 * operator gesture (pick from the menu, or pick "None"), and a separate DELETE
 * would give the client two code paths to keep in sync for one toggle.
 *
 * Gated on `orders.create` (the edit-an-order permission) rather than
 * `orders.view`: a flag is ORG-WIDE shared state, so anyone who can set one is
 * writing something the whole floor reads.
 */

const FlagBody = z.object({
  flag: z.enum(ORDER_ROW_FLAG_IDS).nullable(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });

    const parsed = parseBody(FlagBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const result = await setOrderFlag({
      orderId: id,
      organizationId: gate.ctx.organizationId,
      flag: parsed.flag,
      staffId: gate.ctx.staffId ?? null,
    });

    if (!result.ok) {
      return result.reason === 'not_found'
        ? NextResponse.json({ error: 'Order not found' }, { status: 404 })
        : NextResponse.json({ error: 'Unknown flag' }, { status: 400 });
    }

    // The queue payload is Redis-cached for 300s, and the row's tint / note
    // count are IN that payload — without this the operator's flag silently
    // does not appear for up to five minutes.
    await invalidateAllOrdersApiCaches([], gate.ctx.organizationId);

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-queue-flag',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: id,
      after: { flag: result.flag },
    });

    return NextResponse.json({ success: true, flag: result.flag });
  } catch (error: any) {
    console.error('[PUT /api/orders/[id]/flag] error:', error);
    return NextResponse.json(
      { error: 'Failed to set order flag', details: error?.message },
      { status: 500 },
    );
  }
}
