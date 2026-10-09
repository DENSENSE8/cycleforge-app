import { NextResponse, after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishOrderPickFacts } from '@/lib/picking/pick-facts-publish';
import { removeOrderSerial } from '@/lib/picking/order-serial-remove';
import { UnpickError } from '@/lib/picking/unpick';
import { publishTechLogChanged } from '@/lib/realtime/publish';

/**
 * DELETE /api/orders/[id]/serials `{ serial }` — drop one serial off the order, whichever scan
 * session added it (the phone pick's inline Undo / Replace). Its desk pick goes back to ALLOCATED.
 * Same gate and side effects as `POST /api/picking/desk/serial` (`picking.scan`). Idempotent:
 * a serial already gone answers `removed: false`.
 */
export const DELETE = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const orderId = Number(segments[segments.length - 2]); // …/orders/<id>/serials
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ success: false, error: 'invalid order id' }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { serial?: unknown } | null;
  const serial = String(body?.serial ?? '').trim();
  if (!serial) return NextResponse.json({ success: false, error: 'serial is required' }, { status: 400 });

  let result;
  try {
    result = await removeOrderSerial(ctx.organizationId, { orderId, serial, actorStaffId: ctx.staffId });
  } catch (err) {
    if (err instanceof UnpickError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    throw err;
  }
  if (result.kind === 'not_found') return NextResponse.json({ success: false, error: 'order not found' }, { status: 404 });

  if (result.removed) {
    await invalidateCacheTags(['desk-pick-logs', 'orders-next', 'orders']);
    await publishTechLogChanged({ organizationId: ctx.organizationId, techId: ctx.staffId, action: 'update', source: 'tech.serial' });
    const orderIds = [orderId, ...result.unpicked.map((u) => u.orderId)];
    after(() => publishOrderPickFacts(ctx.organizationId, orderIds, 'pick.phone.remove'));
  }
  return NextResponse.json({
    success: true,
    removed: result.removed,
    serialNumbers: result.serialNumbers,
    unpickedUnits: result.unpicked.length,
  });
}, { permission: 'picking.scan' });
