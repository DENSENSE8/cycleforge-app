/**
 * Brand retrieval for `/api/global-search` (sidebar Phase 1 "Search
 * integration"): `axis=brand` and the brand facet.
 *
 * A doc's brand is `entity_search_docs.brand_id` — the SKU brand NODE the
 * worker stamped (a leaf; may be a product_line such as Wave under Bose), set
 * only for a fact brand (2026-09-26_brands_4). Filtering compares that int
 * column with `= ANY($ids::int[])`, which stays an Index Cond under FORCE RLS
 * (int equality is leakproof; lower()/LIKE/trigram are not). Hierarchy work —
 * "Bose includes Wave", "a Wave hit counts under Bose" — happens in TS over
 * the org's tiny brand tree, never in the doc predicate.
 */

import type { QueryResultRow } from 'pg';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { matchBrandTokens, type BrandTokenMatch } from '@/lib/brands/lookup';
import { brandTokens } from '@/lib/brands/normalize';
import {
  brandAncestors,
  brandRoot,
  brandSubtreeIds,
  loadBrandTree,
  type BrandNode,
} from '@/lib/brands/tree';
import type { SearchEntityType } from '@/lib/search/build-search-text';
import { docRowToHit, normalizeDocRow } from '@/lib/search/hybrid-retrieval';
import type { SearchByScope } from '@/lib/search/search-by';
import { isUiEntityType, toDbEntityType, type SearchHit } from '@/lib/search/search-hit';

/**
 * API-only axis. Deliberately NOT a header picker scope (SEARCH_BY_SCOPES is
 * the picker's display list); the route accepts it alongside them.
 */
export const BRAND_SEARCH_AXIS = 'brand' as const;
export type SearchAxis = SearchByScope | typeof BRAND_SEARCH_AXIS;

/** One facet bucket: a ROOT brand and how many candidate records roll up to it. */
export interface BrandFacetEntry {
  id: number;
  name: string;
  count: number;
}

export interface BrandSearchResult {
  hits: SearchHit[];
  /** Over the WHOLE brand-restricted candidate set, not just the page. */
  facet: BrandFacetEntry[];
}

export interface BrandSearchDeps {
  matchTokens(orgId: OrgId, tokens: string[]): Promise<BrandTokenMatch[]>;
  loadTree(orgId: OrgId): Promise<BrandNode[]>;
  query<R extends QueryResultRow = QueryResultRow>(
    orgId: OrgId,
    sql: string,
    params: unknown[],
  ): Promise<{ rows: R[] }>;
}

const defaultDeps: BrandSearchDeps = {
  matchTokens: (orgId, tokens) => matchBrandTokens(orgId, tokens),
  loadTree: (orgId) => loadBrandTree(orgId),
  query: (orgId, sql, params) => tenantQuery(orgId, sql, params),
};

/** Entity types whose docs can carry a brand (the SKU and the docs holding one). */
const BRANDED_DOC_TYPES: Partial<Record<SearchEntityType, true>> = {
  SKU: true,
  ORDER: true,
  SERIAL_UNIT: true,
  RECEIVING: true,
};

// ── Pure pieces ─────────────────────────────────────────────────────────────

/**
 * The most specific brands a query named: a matched brand that is an ANCESTOR
 * of another matched brand is dropped, so "bose wave" means Wave, not all of
 * Bose. Unrelated brands ("sony bose") both stay.
 */
export function narrowBrandMatches(nodes: readonly BrandNode[], ids: readonly number[]): number[] {
  const unique = [...new Set(ids)];
  const ancestorsOfMatches = new Set<number>();
  for (const id of unique) {
    for (const ancestor of brandAncestors(nodes, id)) ancestorsOfMatches.add(ancestor.id);
  }
  return unique.filter((id) => !ancestorsOfMatches.has(id));
}

/**
 * Query tokens NOT consumed by a brand match. `matched` are the n-grams
 * matchBrandTokens returned, in query order and non-overlapping (it scans
 * left to right, longest hit first), so one forward walk recovers them.
 */
export function residualQueryTokens(tokens: readonly string[], matched: readonly string[]): string[] {
  const out: string[] = [];
  let m = 0;
  for (let i = 0; i < tokens.length; ) {
    const gram = matched[m];
    const width = gram ? gram.split(' ').length : 0;
    if (gram && tokens.slice(i, i + width).join(' ') === gram) {
      i += width;
      m += 1;
      continue;
    }
    out.push(tokens[i]!);
    i += 1;
  }
  return out;
}

/**
 * Leaf-brand counts → root-brand facet: a Wave record counts under Bose.
 * Ids missing from the tree (a brand deleted mid-flight) are dropped rather
 * than shown as a nameless bucket. Largest bucket first, then by name.
 */
export function rollupBrandFacet(
  nodes: readonly BrandNode[],
  counts: ReadonlyArray<{ brandId: number; count: number }>,
): BrandFacetEntry[] {
  const byRoot = new Map<number, BrandFacetEntry>();
  for (const { brandId, count } of counts) {
    const root = brandRoot(nodes, brandId);
    if (!root || !(count > 0)) continue;
    const entry = byRoot.get(root.id) ?? { id: root.id, name: root.name, count: 0 };
    entry.count += count;
    byRoot.set(root.id, entry);
  }
  return [...byRoot.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name) || a.id - b.id,
  );
}

/**
 * The axis=brand statement: the candidate set is every doc whose brand is in
 * `brandIds` (already subtree-expanded); the page ranks it by how many
 * leftover query words its text contains, then by recency; the facet counts
 * the SAME candidate set per leaf brand. One statement, one round trip.
 * Residual tokens are brandTokens output ([a-z0-9&+-]), so they carry no LIKE
 * metacharacters.
 */
export function buildBrandAxisSql(
  orgId: OrgId,
  brandIds: readonly number[],
  residualTokens: readonly string[],
  limit: number,
): { text: string; params: unknown[] } {
  const order = 'rank DESC, happened_at DESC NULLS LAST, entity_type ASC, entity_id ASC';
  return {
    text: `WITH cand AS (
         SELECT entity_type, entity_id, title, subtitle, status, condition_grade,
                source_platform, tracking_number, carrier, serial_number, happened_at,
                brand_id,
                (SELECT COUNT(*) FROM unnest($3::text[]) AS q(tok)
                  WHERE lower(search_text) LIKE '%' || q.tok || '%')::int AS rank
           FROM entity_search_docs
          WHERE organization_id = $1
            AND brand_id = ANY($2::int[])
       ),
       page AS (
         SELECT * FROM cand ORDER BY ${order} LIMIT $4::int
       )
       SELECT
         COALESCE((SELECT json_agg(page ORDER BY ${order}) FROM page), '[]'::json) AS rows,
         COALESCE((SELECT json_agg(json_build_object('brand_id', f.brand_id, 'count', f.n))
                     FROM (SELECT brand_id, COUNT(*)::int AS n FROM cand GROUP BY brand_id) f),
                  '[]'::json) AS facet`,
    params: [orgId, [...brandIds], [...residualTokens], limit],
  };
}

// ── Resolution ──────────────────────────────────────────────────────────────

export interface ResolvedBrandQuery {
  tree: BrandNode[];
  /** The named brands (narrowed) plus every descendant — the doc filter. */
  brandIds: number[];
  /** Normalised query words that named no brand; they rank, never filter. */
  residualTokens: string[];
}

/** Query text → brand filter. Null when the query names no active brand. */
export async function resolveBrandQuery(
  orgId: OrgId,
  query: string,
  deps: Pick<BrandSearchDeps, 'matchTokens' | 'loadTree'> = defaultDeps,
): Promise<ResolvedBrandQuery | null> {
  const tokens = brandTokens(query);
  if (tokens.length === 0) return null;
  const [matches, tree] = await Promise.all([
    deps.matchTokens(orgId, [query]),
    deps.loadTree(orgId),
  ]);
  const named = narrowBrandMatches(tree, matches.map((m) => m.brandId));
  if (named.length === 0) return null;
  return {
    tree,
    brandIds: brandSubtreeIds(tree, named),
    residualTokens: residualQueryTokens(tokens, matches.map((m) => m.token)),
  };
}

// ── Entry points ────────────────────────────────────────────────────────────

/** The objects of a json array column (node-pg parses `json` for us). */
function jsonObjects(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v),
  );
}

/** `axis=brand`: every record whose product is the named brand or under it. */
export async function searchByBrand(
  orgId: OrgId,
  query: string,
  limit: number,
  deps: BrandSearchDeps = defaultDeps,
): Promise<BrandSearchResult> {
  const resolved = await resolveBrandQuery(orgId, query, deps);
  if (!resolved) return { hits: [], facet: [] };

  const { text, params } = buildBrandAxisSql(
    orgId,
    resolved.brandIds,
    resolved.residualTokens,
    limit,
  );
  const { rows } = await deps.query<{ rows: unknown; facet: unknown }>(orgId, text, params);
  const pageRows = jsonObjects(rows[0]?.rows);
  const facetRows = jsonObjects(rows[0]?.facet);

  const hits = pageRows.map((raw, i) =>
    // Page order is the SQL's; the score only has to keep it stable downstream.
    docRowToHit(normalizeDocRow(raw), pageRows.length - i, BRAND_SEARCH_AXIS),
  );
  const facet = rollupBrandFacet(
    resolved.tree,
    facetRows.map((f) => ({ brandId: Number(f.brand_id), count: Number(f.count) })),
  );
  return { hits, facet };
}

/**
 * Brand facet for an already-chosen result list (the non-brand axes): the
 * docs of exactly those records, counted per leaf brand, rolled up to roots.
 * Records of types that never carry a brand are not looked up at all.
 */
export async function brandFacetForResults(
  orgId: OrgId,
  results: ReadonlyArray<{ entityType: string; id: number }>,
  deps: Pick<BrandSearchDeps, 'loadTree' | 'query'> = defaultDeps,
): Promise<BrandFacetEntry[]> {
  const types: string[] = [];
  const ids: number[] = [];
  for (const r of results) {
    if (!isUiEntityType(r.entityType)) continue;
    const dbType = toDbEntityType(r.entityType);
    if (!BRANDED_DOC_TYPES[dbType]) continue;
    types.push(dbType);
    ids.push(r.id);
  }
  if (ids.length === 0) return [];

  const [counts, tree] = await Promise.all([
    deps.query<{ brand_id: number; n: number }>(
      orgId,
      `SELECT brand_id, COUNT(*)::int AS n
         FROM entity_search_docs
        WHERE organization_id = $1
          AND brand_id IS NOT NULL
          AND (entity_type, entity_id) IN (SELECT * FROM UNNEST($2::text[], $3::bigint[]))
        GROUP BY brand_id`,
      [orgId, types, ids],
    ),
    deps.loadTree(orgId),
  ]);
  return rollupBrandFacet(
    tree,
    counts.rows.map((r) => ({ brandId: Number(r.brand_id), count: Number(r.n) })),
  );
}
