/** `findRecords` — the one entry point the operator-facing find surfaces call. */

import { searchAllEntities, type GlobalSearchResult } from '@/lib/search/global-entity-search';
import { hybridSearch, type HybridSearchResult } from '@/lib/search/hybrid-retrieval';
import { looksLikeIdentifier, type SearchHit } from '@/lib/search/search-hit';
import { expandQuery } from '@/lib/search/query-expansion';
import { relaxationLadder } from '@/lib/search/query-relaxation';
import type { SearchByScope } from '@/lib/search/search-by';
import {
  BRAND_SEARCH_AXIS,
  brandFacetForResults,
  searchByBrand,
  type BrandFacetEntry,
  type BrandSearchResult,
  type SearchAxis,
} from '@/lib/search/brand-search';
import type { OrgId } from '@/lib/tenancy/constants';

interface FindRecordsOptions {
  limit: number;
  axis?: SearchAxis;
}

interface RunOnceOptions {
  limit: number;
  axis?: SearchByScope;
}

interface FindRecordsResult {
  rows: GlobalSearchResult[];
  /**
   * The query that actually produced `rows`. Differs from the input only when
   * `relaxed` is true, and the UI shows it so a broadened result set is never
   * passed off as an exact one.
   */
  effectiveQuery: string;
  relaxed: boolean;
  usedSemantic: boolean;
  /** Root-brand buckets over the records behind `rows` (axis=brand: the whole brand-restricted set). */
  brandFacet: BrandFacetEntry[];
}

export interface FindRecordsDeps {
  exact(
    orgId: OrgId,
    query: string,
    limit: number,
    axis?: SearchByScope,
  ): Promise<GlobalSearchResult[]>;
  hybrid(orgId: OrgId, query: string, opts: { limit: number }): Promise<HybridSearchResult>;
  /** axis=brand retrieval: the page plus the facet over the full candidate set. */
  brand(orgId: OrgId, query: string, limit: number): Promise<BrandSearchResult>;
  /** Brand facet for a result list the other arms already chose. */
  brandFacet(orgId: OrgId, rows: GlobalSearchResult[]): Promise<BrandFacetEntry[]>;
}

const defaultDeps: FindRecordsDeps = {
  exact: searchAllEntities,
  hybrid: (orgId, query, opts) => hybridSearch(orgId, query, opts),
  brand: searchByBrand,
  brandFacet: (orgId, rows) => brandFacetForResults(orgId, rows),
};

/** SearchHit → GlobalSearchResult. The doc index carries a strict subset of the
 *  fan-out's entity vocabulary, so this direction is always total. */
function hitToResult(hit: SearchHit): GlobalSearchResult {
  return {
    id: hit.id,
    entityType: hit.entityType,
    title: hit.title,
    subtitle: hit.subtitle,
    href: hit.href,
    matchField: hit.matchField,
    facets: hit.facets as GlobalSearchResult['facets'],
  };
}

function keyOf(row: { entityType: string; id: number }): string {
  return `${row.entityType}:${row.id}`;
}

/** One retrieval pass for one query string. No relaxation happens here. */
async function runOnce(
  orgId: OrgId,
  query: string,
  opts: RunOnceOptions,
  deps: FindRecordsDeps,
): Promise<{ rows: GlobalSearchResult[]; usedSemantic: boolean }> {
  const exact = await deps.exact(orgId, query, opts.limit, opts.axis).catch(() => []);

  // An axis is an explicit instruction to look in one place; an identifier is a
  // factual lookup. Neither wants a fuzzy second opinion. A full page of exact
  // hits does not want one either — there is nothing left to fill.
  if (opts.axis || looksLikeIdentifier(query) || exact.length >= opts.limit) {
    return { rows: exact.slice(0, opts.limit), usedSemantic: false };
  }

  const fuzzy = await deps
    .hybrid(orgId, query, { limit: opts.limit })
    .catch(() => ({ hits: [], usedSemantic: false }) as HybridSearchResult);

  const seen = new Set(exact.map(keyOf));
  const merged: GlobalSearchResult[] = [...exact];
  for (const hit of fuzzy.hits) {
    const key = keyOf(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hitToResult(hit));
    if (merged.length >= opts.limit) break;
  }

  return { rows: merged.slice(0, opts.limit), usedSemantic: fuzzy.usedSemantic };
}

/** Attach the brand facet of the chosen rows; a facet failure never costs the rows. */
async function withBrandFacet(
  orgId: OrgId,
  result: Omit<FindRecordsResult, 'brandFacet'>,
  deps: FindRecordsDeps,
): Promise<FindRecordsResult> {
  const brandFacet =
    result.rows.length > 0 ? await deps.brandFacet(orgId, result.rows).catch(() => []) : [];
  return { ...result, brandFacet };
}

/** Find records, recovering from a miss instead of dead-ending on one. */
export async function findRecords(
  orgId: OrgId,
  query: string,
  opts: FindRecordsOptions,
  deps: FindRecordsDeps = defaultDeps,
): Promise<FindRecordsResult> {
  const q = query.trim();
  const empty: FindRecordsResult = {
    rows: [],
    effectiveQuery: q,
    relaxed: false,
    usedSemantic: false,
    brandFacet: [],
  };
  if (!q) return empty;

  const axis = opts.axis;
  // A brand is an explicit scope like any other axis: never widened, never
  // relaxed. Its facet comes from the same statement as its rows.
  if (axis === BRAND_SEARCH_AXIS) {
    const found = await deps
      .brand(orgId, q, opts.limit)
      .catch((): BrandSearchResult => ({ hits: [], facet: [] }));
    return {
      rows: found.hits.slice(0, opts.limit).map(hitToResult),
      effectiveQuery: q,
      relaxed: false,
      usedSemantic: false,
      brandFacet: found.facet,
    };
  }
  const runOpts: RunOnceOptions = { limit: opts.limit, axis };

  const first = await runOnce(orgId, q, runOpts, deps);
  if (first.rows.length > 0) {
    return withBrandFacet(
      orgId,
      { rows: first.rows, effectiveQuery: q, relaxed: false, usedSemantic: first.usedSemantic },
      deps,
    );
  }

  // A miss on an identifier or a scoped axis is the answer, not a starting
  // point. See the header.
  if (axis || looksLikeIdentifier(q)) return empty;

  const { expansions } = expandQuery(q);
  for (const rung of relaxationLadder(q, expansions)) {
    const retry = await runOnce(orgId, rung, runOpts, deps);
    if (retry.rows.length > 0) {
      return withBrandFacet(
        orgId,
        {
          rows: retry.rows,
          effectiveQuery: rung,
          relaxed: true,
          usedSemantic: retry.usedSemantic,
        },
        deps,
      );
    }
  }

  return empty;
}
