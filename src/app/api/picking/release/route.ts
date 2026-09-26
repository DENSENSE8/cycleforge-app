import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { releaseOrderSessions } from '@/lib/picking/sessions';

/** POST /api/picking/release { order_id } */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json().catch(() => null);
  const orderId = Number(body?.order_id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ ok: false, error: 'order_id is required' }, { status: 400 });
  }
  const released = await releaseOrderSessions({ orderId, pickerStaffId: ctx.staffId }, ctx.organizationId);
  return NextResponse.json({ ok: true, released });
}, { permission: 'orders.view' });
