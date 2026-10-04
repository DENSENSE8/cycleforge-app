import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { listCustomerOrderHistory } from '@/lib/customers/customer-throughput-query';

export const dynamic = 'force-dynamic';

/** GET /api/customers/[id]/orders — every order, grouped with all line items. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'orders.view');
    if (gate.denied) return gate.denied;
    const { id: rawId } = await params;
    const customerId = Number(rawId);
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      return NextResponse.json({ ok: false, error: 'Invalid customer id' }, { status: 400 });
    }
    const orders = await listCustomerOrderHistory(gate.ctx.organizationId, customerId);
    return NextResponse.json({ ok: true, orders });
  } catch (error: unknown) {
    console.error('[GET /api/customers/[id]/orders] error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to load customer orders' }, { status: 500 });
  }
}
