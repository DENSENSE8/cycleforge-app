import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { loadLiveFeedLane } from '@/lib/live-feed/load';
import { LIVE_FEED_PARAMS, readLiveFeedFilters, readLiveFeedStage } from '@/lib/live-feed/route';
import { LIVE_FEED_PERMISSION } from '@/lib/live-feed/stages';

/**
 * GET /api/live-feed/lane?stage=to_pick|picked|packed|scanned_out&offset=N[&carrier=&channel=&staff=]
 *
 * One later page of one Live feed stage, in the board's lane order.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const params = req.nextUrl.searchParams;
    const stage = readLiveFeedStage(params);
    const offset = Number(params.get(LIVE_FEED_PARAMS.offset) ?? 0);
    if (!stage || !Number.isInteger(offset) || offset < 0) {
      return NextResponse.json({ error: 'stage and a non-negative offset are required' }, { status: 400 });
    }
    const page = await loadLiveFeedLane(ctx.organizationId, stage, offset, readLiveFeedFilters(params));
    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } });
  },
  { permission: LIVE_FEED_PERMISSION },
);
