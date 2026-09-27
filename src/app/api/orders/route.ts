import { NextRequest, NextResponse } from 'next/server';
import { logRouteMetric } from '@/lib/route-metrics';
import { withAuth } from '@/lib/auth/withAuth';
import { parseOrdersListQuery } from '@/lib/orders/orders-list-query';
import { isDatabaseUnavailable, listOrders } from '@/lib/orders/orders-list';

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' };

/**
 * GET /api/orders - Fetch orders with optional filters (`@/lib/orders/orders-list-query`).
 * Assignment info (picker_id / packer_id) is sourced from work_assignments.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const startedAt = Date.now();
  let ok = false;
  let cache = 'BYPASS';
  try {
    const query = parseOrdersListQuery(new URL(req.url).searchParams);
    const result = await listOrders(ctx.organizationId, query);
    cache = result.cache;
    ok = true;
    return NextResponse.json(result.payload, {
      headers: { 'x-cache': result.cache, ...CACHE_HEADERS },
    });
  } catch (error) {
    console.error('Error in GET /api/orders:', error);
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { orders: [], count: 0, weekStart: null, weekEnd: null, dbUnavailable: true },
        { headers: { 'x-db-fallback': 'unavailable' } }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch orders', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    logRouteMetric({
      route: '/api/orders',
      method: 'GET',
      startedAt,
      ok,
      details: { cache },
    });
  }
}, { permission: 'orders.view' });
