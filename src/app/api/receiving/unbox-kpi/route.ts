import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { loadUnboxKpi } from '@/lib/receiving/unbox-kpi';

/**
 * GET /api/receiving/unbox-kpi — Unbox Band 2 KPI canvas aggregates.
 *
 * Query: mode (queue|recent|history), urange (24h|7d|30d|90d), optional
 * ustage / ulane / staff (same facet keys as the Unbox table).
 *
 * Scalars + series + pie breakdowns share predicates with `unbox-metrics`
 * (`ukpi` row filters). Permission: receiving.view.
 */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const { searchParams } = new URL(request.url);
  const payload = await loadUnboxKpi({
    orgId: ctx.organizationId,
    mode: searchParams.get('mode'),
    urange: searchParams.get('urange'),
    ustage: searchParams.get('ustage'),
    ulane: searchParams.get('ulane'),
    staff: searchParams.get('staff'),
    viewerStaffId: ctx.staffId ?? null,
  });
  return NextResponse.json(payload);
}, { permission: 'receiving.view' });
