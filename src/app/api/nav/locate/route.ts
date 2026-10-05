/** /api/nav/locate — where identifiers live, per bucket (the sidebar's contextual pills and paste-a-list, src/lib/nav/locate). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseBody } from '@/lib/schemas/parse';
import { NavLocateQuery } from '@/lib/schemas/nav';
import { getNavLocate } from '@/lib/nav/locate/service';
import type { AuthContext } from '@/lib/auth/auth-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The one handler both verbs feed: one schema, one gate, one answer. */
async function locate(
  raw: { locator: unknown; q: unknown; refs: unknown },
  ctx: Pick<AuthContext, 'organizationId' | 'permissions'>,
): Promise<NextResponse> {
  const parsed = parseBody(NavLocateQuery, raw);
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
}

/**
 * GET ?locator=<outbound|inbound|support|everywhere>&(q=<text>|refs=<a,b,…>) → `NavLocateResponse`.
 * Gated per locator by its lists' own permission; `everywhere` answers with
 * the shipping locators the caller may read (support answers on /support only).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    return await locate(
      {
        locator: searchParams.get('locator'),
        q: searchParams.get('q') ?? undefined,
        refs: searchParams.get('refs') ?? undefined,
      },
      ctx,
    );
  } catch (error) {
    return errorResponse(error, 'GET /api/nav/locate');
  }
});

/**
 * POST `{ locator, q } | { locator, refs }` → the same answer as GET, for a
 * pasted list longer than a URL carries. `refs` is the paste text or an array
 * of refs (one per line).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body: unknown = await req.json().catch(() => null);
    const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const refs = Array.isArray(record.refs) ? record.refs.map(String).join('\n') : record.refs;
    return await locate({ locator: record.locator, q: record.q, refs }, ctx);
  } catch (error) {
    return errorResponse(error, 'POST /api/nav/locate');
  }
});
