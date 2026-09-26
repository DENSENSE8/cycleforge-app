import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { releaseOrderSessions } from '@/lib/picking/sessions';
import { pickOrderBodySchema, pickingV1Error } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/release — hand an order back (skip / pass) without staging its tote. */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const parsed = pickOrderBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(pickingV1Error('INVALID_REQUEST', 'orderId is required.'), { status: 400 });
  const released = await releaseOrderSessions({ orderId: parsed.data.orderId, pickerStaffId: ctx.staffId }, ctx.organizationId);
  return NextResponse.json({ data: { released } });
}, { permission: 'orders.view' });
