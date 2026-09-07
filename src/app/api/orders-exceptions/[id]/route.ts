import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { OrderExceptionPatchBody } from '@/lib/schemas/orders-exceptions';
import {
  getOrderExceptionById,
  updateOrderExceptionTracking,
} from '@/lib/orders-exceptions';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { withTenantTransaction } from '@/lib/tenancy/db';

/**
 * PATCH /api/orders-exceptions/[id] — update tracking on a hold-bucket row.
 * Used when the shipped panel surfaces an `EX-…` exception (id is
 * `orders_exceptions.id`, not `orders.id`).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid exception id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(OrderExceptionPatchBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const orgId = gate.ctx.organizationId;
    const result = await updateOrderExceptionTracking(
      id,
      parsed.shippingTrackingNumber,
      orgId,
    );

    if (!result.ok) {
      if (result.code === 'not_found') {
        return NextResponse.json({ error: 'Exception not found' }, { status: 404 });
      }
      if (result.code === 'conflict') {
        return NextResponse.json({ error: result.message }, { status: 409 });
      }
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    await invalidateCacheTags(['orders', 'shipped']);
    // Audit write under the tenant GUC, matching the exception update itself
    // (which runs in its own tenant transaction with org conjuncts).
    await withTenantTransaction(orgId, (client) =>
      recordAudit(client, gate.ctx, req, {
        source: 'orders-exceptions-api',
        action: AUDIT_ACTION.ORDERS_EXCEPTION_UPDATE,
        entityType: AUDIT_ENTITY.ORDERS_EXCEPTION,
        entityId: id,
        before: { ...result.before },
        after: { ...result.after },
      }),
    );

    // Confirm still visible under the tenant GUC (defense in depth).
    const refreshed = await getOrderExceptionById(id, orgId);

    return NextResponse.json({ success: true, exception: refreshed ?? result.after });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update exception';
    console.error('[PATCH /api/orders-exceptions/[id]] error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
