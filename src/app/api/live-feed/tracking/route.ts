import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { readLiveFeedRequest, requireLiveFeedStatus } from '@/lib/live-feed/api-gate';
import { loadLiveFeedTracking } from '@/lib/live-feed/load';

/**
 * GET /api/live-feed/tracking?<the feed's params>
 *
 * Every tracking number of ONE status under the same filters — unpaged,
 * deduped, in list order (a list's or a Board column's Copy all; `page` is
 * ignored). Same gate as `/api/live-feed`; a status of a direction the caller
 * lacks is a 403, a missing one a 400.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const filters = await readLiveFeedRequest(req, ctx);
  if (filters instanceof NextResponse) return filters;
  const statusFilters = requireLiveFeedStatus(filters);
  if (statusFilters instanceof NextResponse) return statusFilters;

  const result = await loadLiveFeedTracking(ctx.organizationId, statusFilters, ctx.permissions);
  if (!result) return NextResponse.json({ error: 'FORBIDDEN', status: statusFilters.status, role: ctx.role }, { status: 403 });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
});
