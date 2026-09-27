import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getBenchmarkComparison } from '@/lib/operations/benchmarks';
import { getOrSet } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS } from '@/lib/cache/tags';

/** GET /api/operations/benchmarks — org-scoped "you vs typical" readout: */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const rawRange = Number(searchParams.get('rangeDays'));
  const rangeDays = Number.isFinite(rawRange) ? Math.max(1, Math.min(365, rawRange)) : 30;
  // Polled ~120s per tab; analytics over the inventory-events spine. Cache 120s
  // org-scoped, keyed by range; order/tech writes bust it.
  const comparison = await getOrSet(
    CACHE_NS.opsDashboard,
    ctx.organizationId,
    `benchmarks:${rangeDays}`,
    120,
    [CACHE_TAGS.orders, CACHE_TAGS.deskPickLogs],
    () => getBenchmarkComparison(ctx.organizationId, rangeDays),
  );
  return NextResponse.json({ success: true, ...comparison });
}, { permission: 'operations.view' });
