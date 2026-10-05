import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { SupportCheckInQuery } from '@/lib/schemas/support-orders';
import { readOrderCheckInViewForOrder } from '@/lib/support/check-ins/projection';

export const dynamic = 'force-dynamic';

/**
 * GET /api/support/check-ins?orderId= — the post-purchase check-in projection
 * of the order that `orders.id` (any line) belongs to, for audit. `checkIn`
 * is null when the order has no projected check-in.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = parseBody(SupportCheckInQuery, { orderId: req.nextUrl.searchParams.get('orderId') ?? '' });
    if (parsed instanceof NextResponse) return parsed;
    const checkIn = await readOrderCheckInViewForOrder(ctx.organizationId, parsed.orderId);
    return NextResponse.json({ checkIn });
  } catch (error) {
    console.error('Error in GET /api/support/check-ins:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read the check-in' },
      { status: 500 },
    );
  }
}, { permission: 'support.thread.view' });
