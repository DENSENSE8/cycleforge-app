import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { startSession } from '@/lib/picking/sessions';
import { emitIdentificationCompleted } from '@/lib/automations/emit-identification-completed';
import { identificationFromPick } from '@/lib/identification';
import { pickOrderBodySchema, pickingV1Error, pickingV1ErrorFromStatus } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/sessions — open (or reuse) the caller's session on a chosen order. */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const parsed = pickOrderBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(pickingV1Error('INVALID_REQUEST', 'orderId is required.'), { status: 400 });
  const { orderId } = parsed.data;

  const result = await startSession({ orderId, pickerStaffId: ctx.staffId, deviceId: null }, ctx.organizationId);
  if (!result.ok) return NextResponse.json(pickingV1ErrorFromStatus(result.status, result.error), { status: result.status });

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
  return NextResponse.json({ data: { sessionId: result.sessionId, reopen: result.reopen } });
}, { permission: 'orders.view' });
