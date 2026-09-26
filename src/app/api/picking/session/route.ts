import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { startSession } from '@/lib/picking/sessions';
import { emitIdentificationCompleted } from '@/lib/automations/emit-identification-completed';
import { identificationFromPick } from '@/lib/identification';

/** POST /api/picking/session */
export const POST = withAuth(async (request, ctx) => {
  const actorStaffId: number | null =
    typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  if (actorStaffId == null) {
    return NextResponse.json({ ok: false, error: 'authenticated picker required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const orderId = Number(body?.order_id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid order_id' }, { status: 400 });
  }
  const deviceIdRaw = typeof body?.device_id === 'string' ? body.device_id.trim() : '';

  try {
    // Thread the caller's tenant id so the shared module enforces the org-ownership 404 gate (orders WHERE id=$1 AND organization_id=$2) and…
    const result = await startSession({
      orderId,
      pickerStaffId: actorStaffId,
      deviceId: deviceIdRaw || null,
    }, ctx.organizationId);
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    if (!result.reopen) {
      try {
        const ident = identificationFromPick({
          source: 'claim',
          organizationId: ctx.organizationId,
          clientEventId: `session:pick:${orderId}`,
          json: { ok: true, orderId, tasks: [{ currentState: 'ALLOCATED' }] },
        });
        void emitIdentificationCompleted({
          organizationId: ctx.organizationId,
          result: ident,
          actorStaffId,
        }).catch((err) => {
          console.error('[POST /api/picking/session] identification.completed', err);
        });
      } catch (err) {
        console.error('[POST /api/picking/session] identification map', err);
      }
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'session start failed';
    console.error('[POST /api/picking/session] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'orders.view' });
