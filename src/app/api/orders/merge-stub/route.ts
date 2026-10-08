import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { MergeStubBody } from '@/lib/schemas/order-merge';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { createOrderNote } from '@/lib/orders/order-notes';
import { mergeStubOrder, stubMergeNote } from '@/lib/orders/stub-merge';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/merge-stub — absorb a duplicate stub order into the
 * surviving order (the Send-replacement dialog's split-brain fix). The stub's
 * labels, shipment links, label documents and notes move over, then the stub
 * row is deleted. Destructive on the stub, so it rides the order-void gate.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  const staffId = ctx.staffId ?? null;

  const raw = await req.json().catch(() => null);
  const parsed = parseBody(MergeStubBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const result = await mergeStubOrder({
    orgId,
    stubOrderId: parsed.stubOrderId,
    targetOrderId: parsed.targetOrderId,
    staffId,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code, error: result.error }, { status: result.status });
  }

  await recordAudit(pool, ctx, req, {
    source: 'orders-merge-stub-api',
    action: AUDIT_ACTION.ORDER_MERGE,
    entityType: AUDIT_ENTITY.ORDER,
    entityId: result.plan.targetId,
    before: { stubOrderId: result.plan.stubId, stubOrderNumber: result.stub.orderNumber },
    after: {
      movedLabelRows: result.applied.movedLabelRows,
      movedLabelDocuments: result.applied.movedLabelDocuments,
      movedLinks: result.applied.movedLinks,
      movedNotes: result.applied.movedNotes,
      promotedShipmentId: result.applied.promotedShipmentId,
    },
    extra: { purposes: result.plan.moves.map((m) => m.purpose) },
  });
  await createOrderNote({
    orderId: result.plan.targetId,
    organizationId: orgId,
    noteText: stubMergeNote(result.stub.orderNumber, result.applied.movedLabelRows),
    staffId,
  }).catch((e) => console.warn('[merge-stub] order note failed', e));
  after(async () => {
    try {
      await invalidateCacheTags(['orders', 'shipped', 'orders-next', 'packing-logs']);
      await publishOrderChanged({
        organizationId: orgId,
        orderIds: [result.plan.targetId, result.plan.stubId],
        source: 'orders.merge-stub',
      });
    } catch (e) {
      console.warn('[merge-stub] realtime/cache failed', e);
    }
  });

  return NextResponse.json({
    ok: true,
    targetOrderId: result.plan.targetId,
    deletedStubOrderId: result.plan.stubId,
    ...result.applied,
  });
}, { permission: 'orders.void' });
