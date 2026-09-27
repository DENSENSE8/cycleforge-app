import { NextResponse, after } from 'next/server';
import { errorResponse } from '@/lib/api/errors';
import { withAuth } from '@/lib/auth/withAuth';
import { BRAND_SEARCH_AXIS, type SearchAxis } from '@/lib/search/brand-search';
import { parseSearchByScope, SEARCH_BY_SCOPES } from '@/lib/search/search-by';
import type { SearchSurface } from '@/lib/search/query-log';
import { serveFindRecords } from '@/lib/search/serve-find-records';

/** Cross-entity find — the engine behind the ⌘K palette and `/search`. */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseSurface(raw: string | null): SearchSurface | null {
  return raw === 'palette' || raw === 'search-page' ? raw : null;
}

export const GET = withAuth(async (req, ctx) => {
  try {
    const params = req.nextUrl.searchParams;
    const query = (params.get('q') ?? params.get('search') ?? '').trim();
    const limit = Math.min(
      Math.max(Number(params.get('limit')) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const rawAxis = params.get('axis');
    // `parseSearchByScope` answers 'internal' for junk, which is a real scope
    // and would silently narrow an unscoped search. Only honour a value the
    // caller actually named. `brand` is API-only (no header picker scope):
    // records whose product is the named brand or one of its lines.
    const axis: SearchAxis | undefined =
      rawAxis === BRAND_SEARCH_AXIS
        ? BRAND_SEARCH_AXIS
        : rawAxis && (SEARCH_BY_SCOPES as readonly string[]).includes(rawAxis)
          ? parseSearchByScope(rawAxis)
          : undefined;
    const surface = parseSurface(params.get('surface'));

    if (!query) {
      return NextResponse.json({
        rows: [],
        count: 0,
        query,
        relaxed: false,
        facets: { brand: [] },
      });
    }

    // Cache + query log live in `serveFindRecords` — the assistant's
    // `find_records` tool serves through the same door.
    const { payload, cache } = await serveFindRecords({
      orgId: ctx.organizationId,
      staffId: ctx.staffId ?? null,
      query,
      limit,
      axis,
      surface,
      defer: after,
    });
    return NextResponse.json(payload, { headers: { 'x-cache': cache } });
  } catch (err) {
    return errorResponse(err, 'GET /api/global-search');
  }
});
