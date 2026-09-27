/**
 * The per-org brand tree (brand → franchise / product_line children). Tiny
 * (tens of rows per org), so callers load it whole in one statement and
 * resolve roll-ups — facet counts, "products of Bose incl. Wave" — in TS.
 */

import type { QueryResultRow } from 'pg';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { BrandKind } from './normalize';

/** Deepest chain a write may create (node + 3 ancestors); the SQL root walk joins exactly this deep. */
export const MAX_BRAND_DEPTH = 4;

export interface BrandNode {
  id: number;
  name: string;
  slug: string;
  kind: BrandKind;
  parentBrandId: number | null;
  isActive: boolean;
}

/** One org-scoped statement runner — `tenantQuery` by default; identify injects its one-trip runner. */
export interface BrandQueryDeps {
  query: <R extends QueryResultRow = QueryResultRow>(
    orgId: OrgId,
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: R[] }>;
}

export const defaultBrandQueryDeps: BrandQueryDeps = {
  query: (orgId, sql, params) => tenantQuery(orgId, sql, params),
};

export async function loadBrandTree(orgId: OrgId, deps: BrandQueryDeps = defaultBrandQueryDeps): Promise<BrandNode[]> {
  const { rows } = await deps.query<{
    id: number;
    name: string;
    slug: string;
    kind: BrandKind;
    parent_brand_id: number | null;
    is_active: boolean;
  }>(
    orgId,
    `SELECT id, name, slug, kind, parent_brand_id, is_active
       FROM product_brands
      WHERE organization_id = $1
      ORDER BY id`,
    [orgId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    slug: r.slug,
    kind: r.kind,
    parentBrandId: r.parent_brand_id == null ? null : Number(r.parent_brand_id),
    isActive: r.is_active,
  }));
}

/** The given ids plus every descendant, deduped, input order first. Unknown ids pass through (they match nothing). */
export function brandSubtreeIds(nodes: readonly BrandNode[], ids: readonly number[]): number[] {
  const children = new Map<number, number[]>();
  for (const n of nodes) {
    if (n.parentBrandId == null) continue;
    const list = children.get(n.parentBrandId) ?? [];
    list.push(n.id);
    children.set(n.parentBrandId, list);
  }
  const out: number[] = [];
  const seen = new Set<number>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** Ancestors of `id`, nearest first; stops at a cycle or a missing parent. */
export function brandAncestors(nodes: readonly BrandNode[], id: number): BrandNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: BrandNode[] = [];
  const seen = new Set<number>([id]);
  let parentId = byId.get(id)?.parentBrandId ?? null;
  while (parentId != null && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    out.push(parent);
    seen.add(parentId);
    parentId = parent.parentBrandId;
  }
  return out;
}

/** The top ancestor (itself when it has no parent); null for an unknown id. */
export function brandRoot(nodes: readonly BrandNode[], id: number): BrandNode | null {
  const self = nodes.find((n) => n.id === id);
  if (!self) return null;
  const chain = brandAncestors(nodes, id);
  return chain.length ? chain[chain.length - 1]! : self;
}
