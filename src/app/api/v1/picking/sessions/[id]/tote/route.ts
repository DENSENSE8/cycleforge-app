import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1DomainError, v1Error, v1PathId } from '@/lib/api/v1-route';
import { pairPickingTote } from '@/lib/picking/sessions';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { pickToteBodySchema } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/sessions/{id}/tote — pair a tote to the order of the caller's open session. */
export const POST = withAuth(async (request, ctx) => {
  const sessionId = v1PathId(request, 2);
  if (sessionId == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid session id.');
  const body = await readV1Json(request, pickToteBodySchema, 'orderId and toteScan are required.');
  if (!body.ok) return body.response;

  const result = await pairPickingTote(ctx.organizationId, { ...body.data, sessionId, staffId: ctx.staffId });
  if (!result.ok) return v1DomainError(result);
  if (!result.alreadyPaired) {
    await recordAudit(pool, ctx, request, {
      source: 'directed-pick',
      action: AUDIT_ACTION.HANDLING_UNIT_PAIR,
      entityType: AUDIT_ENTITY.HANDLING_UNIT,
      entityId: result.toteId,
      after: { orderId: body.data.orderId, sessionId, toteCode: result.toteCode },
    });
  }
  return v1Data({ toteId: result.toteId, toteCode: result.toteCode, alreadyPaired: result.alreadyPaired });
}, { permission: 'orders.view' });
