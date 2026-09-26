import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1DomainError, v1Error, v1PathId } from '@/lib/api/v1-route';
import { recordPickNote } from '@/lib/picking/sessions';
import { pickNoteBodySchema } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/sessions/{id}/notes — a picker note on units of the session. */
export const POST = withAuth(async (request, ctx) => {
  const sessionId = v1PathId(request, 2);
  if (sessionId == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid session id.');
  const body = await readV1Json(request, pickNoteBodySchema, 'allocationIds and 1–1000 characters of text are required.');
  if (!body.ok) return body.response;
  const result = await recordPickNote({ sessionId, ...body.data, actorStaffId: ctx.staffId }, ctx.organizationId);
  if (!result.ok) return v1DomainError(result);
  return v1Data({ recorded: result.recorded });
}, { permission: 'orders.view' });
