import { NextResponse, after } from 'next/server';
import {
  createCacheLookupKey,
  getCachedJson,
  setCachedJson,
} from '@/lib/cache/upstash-cache';
import { errorResponse } from '@/lib/api/errors';
import { withAuth } from '@/lib/auth/withAuth';
import { findRecords } from '@/lib/search/find-records';
import { parseSearchByScope, SEARCH_BY_SCOPES } from '@/lib/search/search-by';
import { recordSearchQuery, type SearchSurface } from '@/lib/search/query-log';

/**
 * Cross-entity find — the engine behind the ⌘K palette and `/search`.
 *
 * GET /api/global-search?q=…&limit=20&axis=serial&surface=palette
 *
 * WHY THIS IS NO LONGER A `createCrudHandler`
 *   That helper builds a fixed `{ rows, count, query, tab }` payload, and this
 *   route now has to tell the client two things it has no slot for: whether the
 *   result set was BROADENED to find anything (`relaxed`) and which query
 *   actually produced it (`effectiveQuery`). Showing relaxed rows as if they
 *   were exact matches is the failure mode that makes an operator trust a
 *   result they should have questioned, so the metadata is not optional. The
 *   Upstash cache the helper provided is kept verbatim below — it was the only
 *   other thing this route used it for.
 *
 * RETRIEVAL
 *   `findRecords` runs the broad parent-table fan-out, fills the remaining
 *   slots from the pg_trgm/pgvector doc index, and climbs a relaxation ladder
 *   only when a free-text query found nothing at all. Identifier and
 *   axis-scoped queries are answered exactly and never widened.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseSurface(raw: string | null): SearchSurface | null {
  return raw === 'palette' || raw === 'search-page' ? raw : null;
}

export const GET = withAuth(async (req, ctx) => {
  const startedAt = Date.now();
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
    // caller actually named.
    const axis =
      rawAxis && (SEARCH_BY_SCOPES as readonly string[]).includes(rawAxis)
        ? parseSearchByScope(rawAxis)
        : undefined;
    const surface = parseSurface(params.get('surface'));

    if (!query) {
      return NextResponse.json({ rows: [], count: 0, query, relaxed: false });
    }

    // Cache namespace is partitioned by org — a shared one would serve one
    // tenant's records to another.
    const namespace = `api:global-search:v5:${ctx.organizationId}`;
    const cacheKey = createCacheLookupKey({
      org: String(ctx.organizationId),
      q: query,
      limit,
      axis: axis ?? '',
    });

    const cached = await getCachedJson<Record<string, unknown>>(namespace, cacheKey);
    if (cached) {
      // A cache hit is still a search the operator ran: log it, or the worklist
      // under-counts exactly the queries people repeat most.
      after(() =>
        recordSearchQuery({
          orgId: ctx.organizationId,
          staffId: ctx.staffId ?? null,
          query,
          axis: axis ?? null,
          surface,
          resultCount: Number(cached.count ?? 0),
          relaxed: Boolean(cached.relaxed),
          usedSemantic: Boolean(cached.usedSemantic),
          latencyMs: Date.now() - startedAt,
        }),
      );
      return NextResponse.json(cached, { headers: { 'x-cache': 'HIT' } });
    }

    const found = await findRecords(ctx.organizationId, query, { limit, axis });

    const payload = {
      rows: found.rows,
      count: found.rows.length,
      query,
      /** True when `rows` came from a broadened retry, not the typed query. */
      relaxed: found.relaxed,
      /** The query that produced `rows`; equals `query` unless `relaxed`. */
      effectiveQuery: found.effectiveQuery,
      usedSemantic: found.usedSemantic,
    };

    await setCachedJson(namespace, cacheKey, payload, 60, [
      'global-search',
      'orders',
      'repair-service',
      'fba',
      'receiving-logs',
      'sku-catalog',
    ]);

    after(() =>
      recordSearchQuery({
        orgId: ctx.organizationId,
        staffId: ctx.staffId ?? null,
        query,
        axis: axis ?? null,
        surface,
        resultCount: found.rows.length,
        relaxed: found.relaxed,
        usedSemantic: found.usedSemantic,
        latencyMs: Date.now() - startedAt,
      }),
    );

    return NextResponse.json(payload, { headers: { 'x-cache': 'MISS' } });
  } catch (err) {
    return errorResponse(err, 'GET /api/global-search');
  }
});
