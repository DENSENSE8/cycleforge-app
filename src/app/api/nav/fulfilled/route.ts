/** /api/nav/fulfilled — every shipped order in a window, answered as the Records sheet's lines with each order's journey (Fulfillment › Fulfilled, `/fulfilled`; src/lib/nav/fulfilled). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { navFulfilledDeps } from '@/lib/nav/fulfilled/read';
import { getNavFulfilled } from '@/lib/nav/fulfilled/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET ?axis=&from=&to=&platform=&carrier=&packer=&scan=&sort=&dir=&q= →
 * `NavFulfilledResponse` (`NavFulfilledQuery` names the params). Gated by the
 * Shipped list's permission (`packing.view`, the `/fulfilled` page's); the
 * service checks it too, so the sidebar's facet counts answer the same way.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const result = await getNavFulfilled(
      { orgId: ctx.organizationId, permissions: ctx.permissions, staffId: ctx.staffId },
      new URL(req.url).searchParams,
      navFulfilledDeps,
    );
    if (!result.ok) {
      const { ok: _ok, status, ...body } = result;
      return NextResponse.json(body, { status });
    }
    return NextResponse.json(result.body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/nav/fulfilled');
  }
}, { permission: 'packing.view' });
