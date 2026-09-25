import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { PairPickingToteBody } from '@/lib/schemas/picking-tote';
import { pairPickingTote } from '@/lib/picking/sessions';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/** POST /api/picking/tote — pair a tote to the current picker's active order. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseBody(PairPickingToteBody, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;
  if (!ctx.staffId) return NextResponse.json({ ok: false, error: 'Authenticated picker required' }, { status: 401 });

  try {
    const result = await pairPickingTote(ctx.organizationId, { ...parsed, staffId: ctx.staffId });
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    if (!result.alreadyPaired) {
      await recordAudit(pool, ctx, req, {
        source: 'directed-pick',
        action: AUDIT_ACTION.HANDLING_UNIT_PAIR,
        entityType: AUDIT_ENTITY.HANDLING_UNIT,
        entityId: result.toteId,
        after: { orderId: parsed.orderId, sessionId: parsed.sessionId, toteCode: result.toteCode },
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/picking/tote]', error);
    return NextResponse.json({ ok: false, error: 'Could not pair tote' }, { status: 500 });
  }
}, { permission: 'orders.view' });
