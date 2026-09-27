/**
 * Brand lookups for identify, scan/resolve and search. Every export here is
 * ONE org-scoped statement (or a fragment embedded in the caller's one
 * statement), so the exact-identifier latency budget survives the brand join.
 *
 * Fact rule: a SKU's brand is returned only through `skuBrandJoinOnSql`
 * (brand_confidence >= 0.90) — a below-threshold proposal never surfaces.
 */

import { skuBrandJoinOnSql } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';
import { aliasNgrams, brandTokens, longestAliasAt, type BrandKind } from './normalize';
import { defaultBrandQueryDeps, MAX_BRAND_DEPTH, type BrandQueryDeps } from './tree';

export { normalizeBrandName } from './normalize';

const SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

function sqlAlias(value: string): string {
  if (!SQL_ALIAS.test(value)) throw new Error(`invalid SQL alias: ${value}`);
  return value;
}

/**
 * FROM/JOIN chain for a brand row `pb` with its ancestors `p1..p3`
 * (MAX_BRAND_DEPTH levels in total). Callers add the select list and the
 * WHERE that picks `pb`.
 */
const BRAND_CHAIN_FROM_SQL = `product_brands pb
      LEFT JOIN product_brands p1 ON p1.id = pb.parent_brand_id AND p1.organization_id = pb.organization_id
      LEFT JOIN product_brands p2 ON p2.id = p1.parent_brand_id AND p2.organization_id = pb.organization_id
      LEFT JOIN product_brands p3 ON p3.id = p2.parent_brand_id AND p3.organization_id = pb.organization_id`;
if (MAX_BRAND_DEPTH !== 4) throw new Error('BRAND_CHAIN_FROM_SQL joins exactly 3 ancestors');

/**
 * Scalar subquery → jsonb `{ id, name, kind, confidence, source, root: { id, name } }`
 * for the already-joined `sku_catalog` row aliased `scAlias`, or NULL when the
 * row has no brand fact. `root` is the top ancestor (Bose for a Wave SKU).
 */
export function sqlSkuBrandJson(scAlias: string): string {
  const sc = sqlAlias(scAlias);
  return `(SELECT jsonb_build_object(
             'id', pb.id, 'name', pb.name, 'kind', pb.kind,
             'confidence', ${sc}.brand_confidence, 'source', ${sc}.brand_source,
             'root', jsonb_build_object(
               'id', COALESCE(p3.id, p2.id, p1.id, pb.id),
               'name', COALESCE(p3.name, p2.name, p1.name, pb.name)))
      FROM ${BRAND_CHAIN_FROM_SQL}
     WHERE ${skuBrandJoinOnSql(sc, 'pb')})`;
}

/**
 * Scalar subquery → the searchable brand text of catalog row `scAlias`: the
 * brand node's and every ancestor's name, publisher and non-ambiguous
 * aliases, space-joined; NULL when the row has no brand fact.
 */
export function sqlSkuBrandSearchText(scAlias: string): string {
  const sc = sqlAlias(scAlias);
  return `(SELECT string_agg(DISTINCT terms.term, ' ')
      FROM ${BRAND_CHAIN_FROM_SQL}
      CROSS JOIN LATERAL (
        SELECT b.name AS term FROM product_brands b
         WHERE b.organization_id = pb.organization_id AND b.id IN (pb.id, p1.id, p2.id, p3.id)
        UNION ALL
        SELECT b.publisher FROM product_brands b
         WHERE b.organization_id = pb.organization_id AND b.id IN (pb.id, p1.id, p2.id, p3.id)
        UNION ALL
        SELECT a.alias FROM product_brand_aliases a
         WHERE a.organization_id = pb.organization_id AND a.brand_id IN (pb.id, p1.id, p2.id, p3.id)
           AND NOT a.review_only
      ) terms
     WHERE ${skuBrandJoinOnSql(sc, 'pb')}
       AND terms.term IS NOT NULL AND terms.term <> '')`;
}

export interface BrandTokenMatch {
  /** The normalised n-gram that hit an alias. */
  token: string;
  brandId: number;
  name: string;
  kind: BrandKind;
  parentBrandId: number | null;
  aliasSource: string;
}

/**
 * Alias hits in free text tokens: each token is normalised, then n-grams of
 * up to MAX_ALIAS_TOKENS are probed in one statement; the longest hit at each
 * position wins and consumes its tokens. Review-only (ambiguous) aliases and
 * inactive brands never classify a token.
 */
export async function matchBrandTokens(
  orgId: OrgId,
  tokens: string[],
  deps: BrandQueryDeps = defaultBrandQueryDeps,
): Promise<BrandTokenMatch[]> {
  const norm = tokens.flatMap((t) => brandTokens(t));
  if (norm.length === 0) return [];
  const { rows } = await deps.query<{
    normalized_alias: string;
    source: string;
    id: number;
    name: string;
    kind: BrandKind;
    parent_brand_id: number | null;
  }>(
    orgId,
    `SELECT a.normalized_alias, a.source, b.id, b.name, b.kind, b.parent_brand_id
       FROM product_brand_aliases a
       JOIN product_brands b ON b.id = a.brand_id AND b.organization_id = a.organization_id
      WHERE a.organization_id = $1
        AND a.normalized_alias = ANY($2::text[])
        AND NOT a.review_only
        AND b.is_active`,
    [orgId, aliasNgrams(norm)],
  );
  const byAlias = new Map(rows.map((r) => [r.normalized_alias, r]));
  const out: BrandTokenMatch[] = [];
  for (let i = 0; i < norm.length; ) {
    const hit = longestAliasAt(norm, i, (g) => byAlias.get(g));
    if (!hit) {
      i += 1;
      continue;
    }
    const r = hit.entry;
    out.push({
      token: hit.ngram,
      brandId: Number(r.id),
      name: r.name,
      kind: r.kind,
      parentBrandId: r.parent_brand_id == null ? null : Number(r.parent_brand_id),
      aliasSource: r.source,
    });
    i += hit.length;
  }
  return out;
}

export interface SkuBrandFact {
  id: number;
  name: string;
  kind: BrandKind;
  confidence: number;
  source: string;
  /** Top ancestor — the display brand for a product_line SKU. */
  root: { id: number; name: string };
}

/** Brand facts for catalog SKUs (exact sku + org), keyed by sku; SKUs without a fact are absent. */
export async function brandsForSkus(
  orgId: OrgId,
  skus: string[],
  deps: BrandQueryDeps = defaultBrandQueryDeps,
): Promise<Map<string, SkuBrandFact>> {
  const wanted = [...new Set(skus.map((s) => String(s ?? '').trim()).filter(Boolean))];
  const out = new Map<string, SkuBrandFact>();
  if (wanted.length === 0) return out;
  const { rows } = await deps.query<{ sku: string; brand: SkuBrandFact | null }>(
    orgId,
    `SELECT sc.sku, ${sqlSkuBrandJson('sc')} AS brand
       FROM sku_catalog sc
      WHERE sc.organization_id = $1
        AND sc.sku = ANY($2::text[])
        AND sc.brand_id IS NOT NULL`,
    [orgId, wanted],
  );
  for (const r of rows) {
    if (!r.brand) continue;
    out.set(r.sku, {
      id: Number(r.brand.id),
      name: r.brand.name,
      kind: r.brand.kind,
      confidence: Number(r.brand.confidence),
      source: r.brand.source,
      root: { id: Number(r.brand.root.id), name: r.brand.root.name },
    });
  }
  return out;
}
