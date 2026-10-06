import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listOrderPackets, parseOrderPacketSearchParams } from '@/lib/label-prints/order-packets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/shipping/label-intake/orders — Labels & docs › Orders: one row per
 * order, shaped as its slots (`OrderPacketQueue`), with every sidebar facet's
 * counts. `?status=`, `?gap=` / `?channel=` (comma list or repeated),
 * `?sort=`, `?q=`, `?limit=`, `?offset=`.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseOrderPacketSearchParams(req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid Orders query.', issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await listOrderPackets(ctx.organizationId, parsed.data));
}, { permission: 'shipping.view' });
