import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { readLiveFeedRequest, requireLiveFeedStatus } from '@/lib/live-feed/api-gate';
import { loadLiveFeed } from '@/lib/live-feed/load';

/**
 * GET /api/live-feed?dir=&status=&channel=&staff=&lens=&from=&to=&timeFrom=&timeTo=&carrier=&q=&carry=&page=
 *
 * ONE Live feed lane (a Board column's expand past its cap): its exact count
 * and one server page of items in lane order (urgency, then age). The range
 * always applies (default: the warehouse's today). Opens with `packing.view`
 * (outbound) or `receiving.view` (inbound); a direction the caller lacks is a
 * 403, a missing lane (or one outside the direction / channel) a 400.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const filters = await readLiveFeedRequest(req, ctx);
  if (filters instanceof NextResponse) return filters;
  const statusFilters = requireLiveFeedStatus(filters);
  if (statusFilters instanceof NextResponse) return statusFilters;

  const feed = await loadLiveFeed(ctx.organizationId, statusFilters, ctx.permissions);
  if (!feed) return NextResponse.json({ error: 'FORBIDDEN', status: statusFilters.status, role: ctx.role }, { status: 403 });
  return NextResponse.json(feed, { headers: { 'Cache-Control': 'no-store' } });
});
