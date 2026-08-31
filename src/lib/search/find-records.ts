/**
 * `findRecords` — the one entry point the operator-facing find surfaces call.
 *
 * WHAT IT FIXES
 *   Two engines existed and the wrong one was wired to the palette.
 *   `searchAllEntities` is a broad fan-out across thirteen parent tables —
 *   orders, units, receiving, repairs, SKUs, FBA, tracking holds, manifests,
 *   tickets, import exceptions — matched with exact rules and ILIKE.
 *   `hybridSearch` ranks a denormalized doc index with a pg_trgm arm and a
 *   pgvector arm fused by reciprocal rank. The palette called the first and the
 *   chat assistant called the second, so operators got substring matching while
 *   the LLM got fuzzy and semantic recall.
 *
 * WHY BOTH, RATHER THAN A SWITCH
 *   Neither is a superset. `hybridSearch` reads only `entity_search_docs`,
 *   which holds six entity types — so routing the palette at it alone would
 *   silently drop tracking holds, support tickets, manifests and import
 *   exceptions from every free-text search. The fan-out, in turn, cannot match
 *   a typo. Running the fan-out first and letting the fuzzy arm fill the
 *   remaining slots is additive: nothing that matched before stops matching,
 *   and misspellings that used to dead-end now land.
 *
 * WHAT NEVER GETS WIDENED
 *   Identifier queries and axis-scoped queries are answered by the exact
 *   fan-out alone, and are never relaxed. A serial that is not here must come
 *   back empty — "here are four units whose serials look like yours" is how the
 *   wrong unit gets picked, and no amount of recall is worth that on a
 *   receiving floor.
 */

import { searchAllEntities, type GlobalSearchResult } from '@/lib/search/global-entity-search';
import { hybridSearch, type HybridSearchResult } from '@/lib/search/hybrid-retrieval';
import { looksLikeIdentifier, type SearchHit } from '@/lib/search/search-hit';
import { expandQuery } from '@/lib/search/query-expansion';
import { relaxationLadder } from '@/lib/search/query-relaxation';
import type { SearchByScope } from '@/lib/search/search-by';
import type { OrgId } from '@/lib/tenancy/constants';

export interface FindRecordsOptions {
  limit: number;
  axis?: SearchByScope;
}

export interface FindRecordsResult {
  rows: GlobalSearchResult[];
  /**
   * The query that actually produced `rows`. Differs from the input only when
   * `relaxed` is true, and the UI shows it so a broadened result set is never
   * passed off as an exact one.
   */
  effectiveQuery: string;
  relaxed: boolean;
  usedSemantic: boolean;
}

export interface FindRecordsDeps {
  exact(
    orgId: OrgId,
    query: string,
    limit: number,
    axis?: SearchByScope,
  ): Promise<GlobalSearchResult[]>;
  hybrid(orgId: OrgId, query: string, opts: { limit: number }): Promise<HybridSearchResult>;
}

const defaultDeps: FindRecordsDeps = {
  exact: searchAllEntities,
  hybrid: (orgId, query, opts) => hybridSearch(orgId, query, opts),
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
  opts: FindRecordsOptions,
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

/**
 * Find records, recovering from a miss instead of dead-ending on one.
 *
 * The ladder is only climbed when the literal query returned nothing at all.
 * A query that found even one row is answered with what it found — partial
 * results are not a failure worth second-guessing, and quietly widening them
 * would make the result set stop matching what the operator typed.
 */
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
  };
  if (!q) return empty;

  const first = await runOnce(orgId, q, opts, deps);
  if (first.rows.length > 0) {
    return { rows: first.rows, effectiveQuery: q, relaxed: false, usedSemantic: first.usedSemantic };
  }

  // A miss on an identifier or a scoped axis is the answer, not a starting
  // point. See the header.
  if (opts.axis || looksLikeIdentifier(q)) return empty;

  const { expansions } = expandQuery(q);
  for (const rung of relaxationLadder(q, expansions)) {
    const retry = await runOnce(orgId, rung, opts, deps);
    if (retry.rows.length > 0) {
      return {
        rows: retry.rows,
        effectiveQuery: rung,
        relaxed: true,
        usedSemantic: retry.usedSemantic,
      };
    }
  }

  return empty;
}
