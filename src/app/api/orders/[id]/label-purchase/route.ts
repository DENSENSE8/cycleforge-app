import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getOrderLabelSummary } from '@/lib/shipping/order-label-summary';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * GET /api/orders/[id]/label-purchase — the order's shipping label as the
 * To-ship evidence column shows it: status (none / bought / pending / linked /
 * voided) plus the current purchase-ledger row (carrier, service, cost,
 * tracking, who bought it and when). Read-only.
 * Domain logic: lib/shipping/order-label-summary.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'shipping.view');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const orderId = Number(rawId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ success: false, error: 'Invalid order id' }, { status: 400 });
  }

  try {
    const summary = await getOrderLabelSummary(gate.ctx.organizationId as OrgId, orderId);
    if (!summary) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('Error in GET /api/orders/[id]/label-purchase:', error);
    return NextResponse.json({ success: false, error: 'Could not read the label purchase.' }, { status: 500 });
  }
}
