/** /api/nav/facets — facet option counts for the active view (the contextual sidebar's filter groups, src/lib/nav/facets). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseBody } from '@/lib/schemas/parse';
import { NavFacetsQuery } from '@/lib/schemas/nav';
import { getNavFacets } from '@/lib/nav/facets/service';

export const dynamic = 'force-dynamic';

/**
 * GET ?context=<pageId.sectionItemId>&…the view's own list params → `NavFacetsResponse`.
 * Gated per context by the permission of that view's own list endpoint.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = parseBody(NavFacetsQuery, { context: searchParams.get('context') });
    if (parsed instanceof NextResponse) return parsed;
    const result = await getNavFacets(
      { orgId: ctx.organizationId, staffId: ctx.staffId ?? null, permissions: ctx.permissions },
      parsed.context,
      searchParams,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error, permission: result.permission }, { status: result.status });
    }
    return NextResponse.json(result.body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/nav/facets');
  }
});
