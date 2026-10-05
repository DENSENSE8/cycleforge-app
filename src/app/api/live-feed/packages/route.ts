import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { findLiveFeedPackages, loadLiveFeedPackages } from '@/lib/live-feed/load';
import { LIVE_FEED_PARAMS, readLiveFeedIds } from '@/lib/live-feed/route';
import { LIVE_FEED_PERMISSION } from '@/lib/live-feed/stages';

/**
 * GET /api/live-feed/packages?q=<tracking | order number | SKU>
 * GET /api/live-feed/packages?ids=<order row ids, comma-separated>
 *
 * Packages inside the Live feed's scope (in the building, or scanned out
 * today), in lane order: what a scan / find names, or what a deep link or a
 * box mate opens when it is not on a loaded page. Sidebar filters are not
 * applied — a named package opens whatever the facets say.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const params = req.nextUrl.searchParams;
    const q = params.get(LIVE_FEED_PARAMS.q)?.trim() ?? '';
    const ids = readLiveFeedIds(params);
    if (!q && ids.length === 0) {
      return NextResponse.json({ error: 'q or ids is required' }, { status: 400 });
    }
    const packages = q ? await findLiveFeedPackages(ctx.organizationId, q) : await loadLiveFeedPackages(ctx.organizationId, ids);
    return NextResponse.json({ packages }, { headers: { 'Cache-Control': 'no-store' } });
  },
  { permission: LIVE_FEED_PERMISSION },
);
