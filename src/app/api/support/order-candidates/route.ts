import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { SupportOrderCandidatesQuery } from '@/lib/schemas/support-orders';
import { resolveOrderReference } from '@/lib/support/orders/resolve-order-reference';

export const dynamic = 'force-dynamic';

/**
 * GET /api/support/order-candidates?q= — pasted order number / marketplace
 * id / tracking / listing URL / `orders:<id>` → candidate local orders.
 * `ambiguous: true` means more than one distinct order matched: the staffer
 * picks; nothing is linked here. Local DB only.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = parseBody(SupportOrderCandidatesQuery, { q: req.nextUrl.searchParams.get('q') ?? '' });
    if (parsed instanceof NextResponse) return parsed;
    const result = await resolveOrderReference(ctx.organizationId, parsed.q);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET /api/support/order-candidates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve the order reference' },
      { status: 500 },
    );
  }
}, { permission: 'support.thread.view' });
