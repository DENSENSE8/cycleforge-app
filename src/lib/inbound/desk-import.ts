/** Catalog resolvers for imported inbound rows (Amazon returns: the ASIN is the catalog SKU) and the identity PATCH. Rows land through `import-batch.ts`. */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

/**
 * Resolve sku_catalog where sku equals ASIN (case-insensitive, org-scoped).
 * No platform_id crosswalk — locked match rule for Amazon returns import.
 */
export async function resolveCatalogByAsinSku(
  orgId: OrgId,
  asin: string,
): Promise<{ id: number; sku: string; product_title: string } | null> {
  const needle = asin.trim();
  if (!needle) return null;
  const r = await tenantQuery<{
    id: number;
    sku: string;
    product_title: string;
  }>(
    orgId,
    `SELECT id, sku, product_title
       FROM sku_catalog
      WHERE organization_id = $1::uuid
        AND lower(sku) = lower($2)
        AND is_active = true
      ORDER BY id
      LIMIT 1`,
    [orgId, needle],
  );
  return r.rows[0] ?? null;
}

/** Resolve an active catalog row by primary key (Add Return picker). */
export async function resolveCatalogById(
  orgId: OrgId,
  catalogId: number,
): Promise<{ id: number; sku: string; product_title: string } | null> {
  const id = Number(catalogId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const r = await tenantQuery<{
    id: number;
    sku: string;
    product_title: string;
  }>(
    orgId,
    `SELECT id, sku, product_title
       FROM sku_catalog
      WHERE organization_id = $1::uuid
        AND id = $2
        AND is_active = true
      LIMIT 1`,
    [orgId, id],
  );
  return r.rows[0] ?? null;
}
