/**
 * `serveFindRecords` — `findRecords` as the operator's surfaces serve it: the
 * org-partitioned read-through cache and one `search_query_log` row per
 * search (cache hits included). `/api/global-search` (palette, `/search`) and
 * the assistant's `find_records` tool both call this, so a query that resolves
 * on `/search` resolves identically in chat and lands in the same worklist,
 * told apart only by `surface`.
 */

import { createCacheLookupKey, getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { findRecords } from '@/lib/search/find-records';
import type { SearchAxis, BrandFacetEntry } from '@/lib/search/brand-search';
import type { GlobalSearchResult } from '@/lib/search/global-entity-search';
import { recordSearchQuery, type SearchSurface } from '@/lib/search/query-log';
import type { OrgId } from '@/lib/tenancy/constants';

export interface FindRecordsPayload {
  rows: GlobalSearchResult[];
  count: number;
  query: string;
  /** True when `rows` came from a broadened retry, not the typed query. */
  relaxed: boolean;
  /** The query that produced `rows`; equals `query` unless `relaxed`. */
  effectiveQuery: string;
  usedSemantic: boolean;
  /** Root-brand buckets (a Wave record counts under Bose) over the records behind `rows`. */
  facets: { brand: BrandFacetEntry[] };
}

export interface ServeFindRecordsInput {
  orgId: OrgId;
  staffId: number | null;
  query: string;
  limit: number;
  axis?: SearchAxis;
  surface: SearchSurface | null;
  /**
   * Runs the query-log write off the response path. A route hands Next's
   * `after`; the default fires and forgets (a log failure never costs rows).
   */
  defer?: (task: () => Promise<void>) => void;
}

const fireAndForget = (task: () => Promise<void>) => {
  void task().catch(() => {});
};

/** Tags that drop a cached answer on any write to the records it spans. */
const FIND_RECORDS_CACHE_TAGS = ['global-search', 'orders', 'repair-service', 'fba', 'receiving-logs', 'sku-catalog'];

export async function serveFindRecords(
  input: ServeFindRecordsInput,
): Promise<{ payload: FindRecordsPayload; cache: 'HIT' | 'MISS' }> {
  const startedAt = Date.now();
  const { orgId, query, limit, axis, surface } = input;
  const defer = input.defer ?? fireAndForget;
  const log = (resultCount: number, relaxed: boolean, usedSemantic: boolean) =>
    defer(() =>
      recordSearchQuery({
        orgId,
        staffId: input.staffId,
        query,
        axis: axis ?? null,
        surface,
        resultCount,
        relaxed,
        usedSemantic,
        latencyMs: Date.now() - startedAt,
      }),
    );

  // Cache namespace is partitioned by org — a shared one would serve one
  // tenant's records to another. v7: order status now prefers delivered
  // carrier truth over a stale internal packed flag.
  const namespace = `api:global-search:v7:${orgId}`;
  const cacheKey = createCacheLookupKey({ org: String(orgId), q: query, limit, axis: axis ?? '' });

  const cached = await getCachedJson<FindRecordsPayload>(namespace, cacheKey);
  if (cached) {
    // A cache hit is still a search the operator ran: log it, or the worklist
    // under-counts exactly the queries people repeat most.
    log(Number(cached.count ?? 0), Boolean(cached.relaxed), Boolean(cached.usedSemantic));
    return { payload: cached, cache: 'HIT' };
  }

  const found = await findRecords(orgId, query, { limit, axis });
  const payload: FindRecordsPayload = {
    rows: found.rows,
    count: found.rows.length,
    query,
    relaxed: found.relaxed,
    effectiveQuery: found.effectiveQuery,
    usedSemantic: found.usedSemantic,
    facets: { brand: found.brandFacet },
  };
  // The write is fail-open and nothing on this response reads it back: one
  // Redis round trip the caller no longer waits on.
  defer(() => setCachedJson(namespace, cacheKey, payload, 60, FIND_RECORDS_CACHE_TAGS));
  log(found.rows.length, found.relaxed, found.usedSemantic);
  return { payload, cache: 'MISS' };
}
