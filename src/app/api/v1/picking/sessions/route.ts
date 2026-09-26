import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1DomainError } from '@/lib/api/v1-route';
import { startSession } from '@/lib/picking/sessions';
import { emitIdentificationCompleted } from '@/lib/automations/emit-identification-completed';
import { identificationFromPick } from '@/lib/identification';
import { pickOrderBodySchema } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/sessions — open (or reuse) the caller's session on a chosen order. */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, pickOrderBodySchema, 'orderId is required.');
  if (!body.ok) return body.response;
  const { orderId } = body.data;

  const result = await startSession({ orderId, pickerStaffId: ctx.staffId, deviceId: null }, ctx.organizationId);
  if (!result.ok) return v1DomainError(result);

  if (!result.reopen) {
    // A fresh claim is an identification event; best-effort, never fails the open.
    try {
      const ident = identificationFromPick({
        source: 'claim',
        organizationId: ctx.organizationId,
        clientEventId: `session:pick:${orderId}`,
        json: { ok: true, orderId, tasks: [{ currentState: 'ALLOCATED' }] },
      });
      void emitIdentificationCompleted({ organizationId: ctx.organizationId, result: ident, actorStaffId: ctx.staffId }).catch(
        (err) => console.error('[POST /api/v1/picking/sessions] identification.completed', err),
      );
    } catch (err) {
      console.error('[POST /api/v1/picking/sessions] identification map', err);
    }
  }
  return v1Data({ sessionId: result.sessionId, reopen: result.reopen });
}, { permission: 'orders.view' });
