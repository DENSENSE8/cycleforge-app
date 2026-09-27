import { NextRequest, NextResponse } from 'next/server';
import { logRouteMetric } from '@/lib/route-metrics';
import { withAuth } from '@/lib/auth/withAuth';
import { getQueueCounts } from '@/lib/orders/queue-counts';
import { ZERO_QUEUE_COUNTS } from '@/lib/orders/queue-counts-normalize';

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' };

/** GET /api/orders/queue-counts — To-ship tallies without the rows (`@/lib/orders/queue-counts`). */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const startedAt = Date.now();
  let ok = false;
  let cache = 'BYPASS';
  try {
    const staffRaw = new URL(req.url).searchParams.get('staff');
    const staffId =
      staffRaw && Number.isFinite(Number(staffRaw)) && Number(staffRaw) > 0 ? Number(staffRaw) : null;
    const result = await getQueueCounts(ctx.organizationId, { staffId });
    cache = result.cache;
    ok = true;
    return NextResponse.json(result.payload, { headers: { 'x-cache': result.cache, ...CACHE_HEADERS } });
  } catch (error) {
    console.error('Error in GET /api/orders/queue-counts:', error);
    // SUB-RESOURCE: a sidebar count must not 500 the queue, so this stays 200 —
    // but zero is a real answer here ("nothing needs you"), so the fallback
    // carries `degraded` rather than passing itself off as an honest all-clear.
    return NextResponse.json(
      { ...ZERO_QUEUE_COUNTS, degraded: true, error: 'queue_counts_unavailable' },
      { status: 200, headers: { 'x-db-fallback': 'error' } },
    );
  } finally {
    logRouteMetric({ route: '/api/orders/queue-counts', method: 'GET', startedAt, ok, details: { cache } });
  }
}, { permission: 'orders.view' });
