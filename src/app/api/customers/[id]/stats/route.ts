import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getCustomerOrderStats } from '@/lib/customers/customer-order-stats-query';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customers/[id]/stats — the buyer's order count, realised spend and
 * first / last order date (the order record's customer line).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.view');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'Invalid customer id' }, { status: 400 });
    }

    const stats = await getCustomerOrderStats(id, gate.ctx.organizationId);
    if (!stats) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true, ...stats });
  } catch (error: unknown) {
    console.error('[GET /api/customers/[id]/stats] error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to load customer stats' }, { status: 500 });
  }
}
