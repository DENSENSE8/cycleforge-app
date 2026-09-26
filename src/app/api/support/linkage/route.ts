import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveOrderLinkage } from '@/lib/order-linkage';

export const dynamic = 'force-dynamic';

const Query = z.object({
  order: z.string().trim().min(1).max(128).optional(),
  tracking: z.string().trim().min(1).max(128).optional(),
  serial: z.string().trim().min(1).max(128).optional(),
});

/** GET /api/support/linkage?order=&tracking=&serial= */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/support/linkage';
  try {
    const sp = req.nextUrl.searchParams;
    const parsed = Query.parse({
      order: sp.get('order') ?? undefined,
      tracking: sp.get('tracking') ?? undefined,
      serial: sp.get('serial') ?? undefined,
    });
    if (!parsed.order && !parsed.tracking && !parsed.serial) {
      return NextResponse.json(
        { success: false, error: 'one of order, tracking, or serial is required' },
        { status: 400 },
      );
    }
    const linkage = await resolveOrderLinkage(ctx.organizationId, parsed);
    return NextResponse.json({ success: true, linkage });
  } catch (err) {
    return errorResponse(err, context);
  }
}, { permission: 'integrations.zendesk', feature: 'support' });
