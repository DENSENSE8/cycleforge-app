import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { loadLiveFeedBoard } from '@/lib/live-feed/load';
import { readLiveFeedFilters } from '@/lib/live-feed/route';
import { LIVE_FEED_PERMISSION } from '@/lib/live-feed/stages';

/**
 * GET /api/live-feed/board[?carrier=USPS,UPS&channel=amazon&staff=12]
 *
 * Today's Live feed board, narrowed by the sidebar's facets / staff filter:
 * each stage's exact count (open stages = the whole backlog still in the
 * building, with how many entered before today, are past ship-by or are
 * stalled; Scanned out = first dock scan-out today, plus yesterday's count),
 * its first page of cards, the hourly pace, each carrier's load, today's
 * pickup countdowns and the facet counts.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const board = await loadLiveFeedBoard(ctx.organizationId, readLiveFeedFilters(req.nextUrl.searchParams));
    return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } });
  },
  { permission: LIVE_FEED_PERMISSION },
);
