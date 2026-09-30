import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { createCacheLookupKey, getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { logRouteMetric } from '@/lib/route-metrics';
import type { OrgId } from '@/lib/tenancy/constants';
import { getDeskCounts } from '@/lib/orders/desk-counts';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' };

/** GET /api/orders/desk-counts — the outbound desk's four lens totals in one request: */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const startedAt = Date.now();
  let ok = false;
  let cache = 'BYPASS';
  try {
    const orgId = ctx.organizationId as OrgId;
    // Bump `version` when any membership rule in desk-counts changes.
    const cacheLookup = createCacheLookupKey({ organizationId: orgId, version: 'desk_counts_v2' });
    const cached = await getCachedJson<unknown>('api:orders-desk-counts', cacheLookup);
    if (cached) {
      ok = true;
      cache = 'HIT';
      return NextResponse.json(cached, { headers: { 'x-cache': 'HIT', ...CACHE_HEADERS } });
    }

    const counts = await getDeskCounts(orgId);
    await setCachedJson('api:orders-desk-counts', cacheLookup, counts, 60, ['orders']);
    cache = 'MISS';
    ok = true;
    return NextResponse.json(counts, { headers: { 'x-cache': 'MISS', ...CACHE_HEADERS } });
  } catch (error) {
    return errorResponse(error, 'GET /api/orders/desk-counts');
  } finally {
    logRouteMetric({ route: '/api/orders/desk-counts', method: 'GET', startedAt, ok, details: { cache } });
  }
}, { permission: 'orders.view' });
