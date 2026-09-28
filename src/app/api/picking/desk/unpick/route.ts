import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { UnpickError, unpickOrder } from '@/lib/picking/unpick';
import { publishOrderPickFacts } from '@/lib/picking/pick-facts-publish';

/**
 * POST /api/picking/desk/unpick `{ orderId }` — take an order's pick back.
 *
 * Every unit the order had picked returns to ALLOCATED (allocation too,
 * through the state machine, one inventory event each), its pick scans are
 * voided (desk scan sessions + serials removed, SKU-pick stock put back), its
 * picking sessions abandoned, its totes unpaired and the bench placement its
 * pick scan made cleared; `order_stage_facts` refreshes in the same
 * transaction. Idempotent: a repeat answers `alreadyUnpicked: true`. A packed
 * order is refused (409) — un-pack it first (DELETE /api/packerlogs).
 * Audited as `order.unpick` with the removed rows; publishes `order.picked`
 * with the cleared fact (`picked: false`).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  const orderId = Number(body?.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ success: false, error: 'orderId is required' }, { status: 400 });
  }
  const orgId = ctx.organizationId;
  const actorStaffId = typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;

  let result;
  try {
    result = await withTenantTransaction(orgId, async (client) => {
      const r = await unpickOrder(client, orgId, { orderId, actorStaffId, source: 'pick.unpick' });
      await refreshOrderStageFacts(orgId, { orderIds: [orderId] }, client);
      return r;
    });
  } catch (err) {
    if (err instanceof UnpickError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (!result.alreadyUnpicked) {
    await recordAudit(pool, ctx, req, {
      source: 'api.picking.desk.unpick',
      action: AUDIT_ACTION.ORDER_UNPICK,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderId,
      before: {
        scans: result.voided.scans,
        serials: [...result.voided.serials, ...result.unboundSerials],
        abandoned_session_ids: result.abandonedSessionIds,
        released_totes: result.releasedTotes,
        cleared_placement: result.clearedPlacement,
      },
      after: { unpicked: result.unpicked, stock_reversals: result.voided.stockReversals },
    });
    // `/api/orders` caches under the global scope, the station feeds per org.
    await invalidateCacheTags(['desk-pick-logs', 'orders-next', 'orders']);
    await invalidateCacheTags(orgId, ['desk-pick-logs', 'orders-next', 'orders']);
  }
  after(() => publishOrderPickFacts(orgId, [orderId], 'pick.unpick'));

  return NextResponse.json({
    success: true,
    orderId,
    unpickedUnits: result.unpicked.length,
    voidedScans: result.voided.scans.length,
    closedSessions: result.abandonedSessionIds.length,
    releasedTotes: result.releasedTotes,
    clearedPlacement: result.clearedPlacement,
    alreadyUnpicked: result.alreadyUnpicked,
  });
}, { permission: 'picking.scan' });
