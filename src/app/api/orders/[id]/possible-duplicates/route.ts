import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseDuplicateWindowDays } from '@/lib/orders/possible-duplicates';
import { findPossibleDuplicateOrders } from '@/lib/orders/possible-duplicates-query';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/[id]/possible-duplicates?days=30 — other orders by the same
 * buyer carrying the same SKU within `days` of this one (the record's
 * duplicate-order banner). `orderDate` is this order's placed time.
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
      return NextResponse.json({ ok: false, error: 'Invalid order id' }, { status: 400 });
    }

    const days = parseDuplicateWindowDays(req.nextUrl.searchParams.get('days'));
    const result = await findPossibleDuplicateOrders(gate.ctx.organizationId, id, days);
    return NextResponse.json({ ok: true, days, ...result });
  } catch (error: unknown) {
    console.error('[GET /api/orders/[id]/possible-duplicates] error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to check for duplicate orders' }, { status: 500 });
  }
}
