/** /api/nav/locate — where identifiers live, per bucket (the sidebar's contextual pills and paste-a-list, src/lib/nav/locate). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseBody } from '@/lib/schemas/parse';
import { NavLocateQuery } from '@/lib/schemas/nav';
import { getNavLocate } from '@/lib/nav/locate/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET ?locator=<outbound|inbound|everywhere>&(q=<text>|refs=<a,b,…>) → `NavLocateResponse`.
 * Gated per locator by its lists' own permission; `everywhere` answers with
 * the locators the caller may read.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = parseBody(NavLocateQuery, {
      locator: searchParams.get('locator'),
      q: searchParams.get('q') ?? undefined,
      refs: searchParams.get('refs') ?? undefined,
    });
    if (parsed instanceof NextResponse) return parsed;
    const result = await getNavLocate(
      { orgId: ctx.organizationId, permissions: ctx.permissions },
      parsed.locator,
      parsed.q !== undefined ? { q: parsed.q } : { refs: parsed.refs ?? '' },
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error, permission: result.permission }, { status: result.status });
    }
    return NextResponse.json(result.body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/nav/locate');
  }
});
