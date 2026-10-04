/**
 * GET /api/receiving/inbound/orders/for-carton?receivingId=<id> — the inbound
 * orders a carton's lines belong to, so the phone carton record can open the
 * order behind it for correction. Read-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listCartonInboundOrders } from '@/lib/inbound/load-inbound-order-edit';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const receivingId = Number(request.nextUrl.searchParams.get('receivingId'));
  if (!Number.isInteger(receivingId) || receivingId <= 0) {
    return NextResponse.json({ success: false, error: 'receivingId is required' }, { status: 400 });
  }
  const orders = await listCartonInboundOrders(ctx.organizationId, receivingId);
  return NextResponse.json({ success: true, orders });
}, { permission: 'receiving.view' });
