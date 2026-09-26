import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { pairPickingTote } from '@/lib/picking/sessions';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { pickToteBodySchema, pickingV1Error, pickingV1ErrorFromStatus } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/sessions/{id}/tote — pair a tote to the order of the caller's open session. */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const sessionId = Number(request.nextUrl.pathname.split('/').at(-2));
  const parsed = pickToteBodySchema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(sessionId) || sessionId <= 0 || !parsed.success) {
    return NextResponse.json(pickingV1Error('INVALID_REQUEST', 'A session id, orderId and toteScan are required.'), { status: 400 });
  }

  const result = await pairPickingTote(ctx.organizationId, { ...parsed.data, sessionId, staffId: ctx.staffId });
  if (!result.ok) return NextResponse.json(pickingV1ErrorFromStatus(result.status, result.error), { status: result.status });
  if (!result.alreadyPaired) {
    await recordAudit(pool, ctx, request, {
      source: 'directed-pick',
      action: AUDIT_ACTION.HANDLING_UNIT_PAIR,
      entityType: AUDIT_ENTITY.HANDLING_UNIT,
      entityId: result.toteId,
      after: { orderId: parsed.data.orderId, sessionId, toteCode: result.toteCode },
    });
  }
  return NextResponse.json({ data: { toteId: result.toteId, toteCode: result.toteCode, alreadyPaired: result.alreadyPaired } });
}, { permission: 'orders.view' });
