import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getOrderTrackingHistory } from '@/lib/orders/order-tracking-history';
import type { OrgId } from '@/lib/tenancy/constants';

/** GET /api/orders/[id]/tracking-history — earlier tracking numbers, newest first (never the current one). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const orderId = Number(rawId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  try {
    const history = await getOrderTrackingHistory(gate.ctx.organizationId as OrgId, orderId);
    if (!history) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ entries: history.entries });
  } catch (error) {
    console.error('Error in GET /api/orders/[id]/tracking-history:', error);
    return NextResponse.json({ error: 'Could not read the tracking history.' }, { status: 500 });
  }
}
