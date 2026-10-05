import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { isOpsTvBoard } from '@/lib/feature-flags';
import { loadLiveFeedBoard } from '@/lib/live-feed/load';
import { toTvLiveFeed } from '@/lib/ops-plans/tv-live-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/operations/tv-board/live-feed — the Live feed's package floor for
 * the unattended Operations wall board. Gated like the wall board itself
 * (`operations.tv.view`, flag `ops_tv_board`), not by the feed's
 * `packing.view`: a TV kiosk holds only the wall permission, and it gets
 * numbers only (per-stage counts, scan-outs, pace, pickups) — no cards.
 */
export const GET = withAuth(
  async (_req, ctx) => {
    const orgId = ctx.organizationId;

    if (!(await isOpsTvBoard(orgId))) {
      return NextResponse.json({ error: 'NOT_ENABLED' }, { status: 404 });
    }

    const liveFeed = toTvLiveFeed(await loadLiveFeedBoard(orgId));
    return NextResponse.json({ liveFeed }, { headers: { 'Cache-Control': 'no-store' } });
  },
  { permission: 'operations.tv.view' },
);
