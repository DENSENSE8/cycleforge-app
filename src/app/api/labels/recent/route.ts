import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listRecentLabelPrints } from '@/lib/labels/recent-prints';

/** GET /api/labels/recent — server-backed Recently Printed feed. */
export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get('limit'));
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
    const staffParam = searchParams.get('staffId');
    const staffFilter =
      staffParam === 'all' ? null : staffParam ? Number(staffParam) : ctx.staffId ?? null;

    const items = await listRecentLabelPrints(ctx.organizationId, { limit, staffId: staffFilter });
    return NextResponse.json({ success: true, items });
  },
  { permission: 'print.label' },
);
