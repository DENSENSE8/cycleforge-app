import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getOrderPriceBreakdown } from '@/lib/orders/order-price-breakdown';
import type { OrgId } from '@/lib/tenancy/constants';

/** GET /api/orders/[id]/price-breakdown — the Selected-order column's Price panel: */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;

  const orderId = Number((await params).id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ success: false, error: 'Invalid order id' }, { status: 400 });
  }

  try {
    const breakdown = await getOrderPriceBreakdown(gate.ctx.organizationId as OrgId, orderId);
    if (!breakdown) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ success: true, ...breakdown });
  } catch (error) {
    console.error('Error in GET /api/orders/[id]/price-breakdown:', error);
    return NextResponse.json({ success: false, error: 'Could not read the order’s prices.' }, { status: 500 });
  }
}
