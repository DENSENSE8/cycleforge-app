/** Resolve a marketplace item number (ASIN / eBay item id / platform_item_id) to one or more sku_catalog rows for mobile checklist authoring. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getSkuCatalogById,
  getSkuCatalogBySku,
  resolveSkuCatalogByPlatformId,
} from '@/lib/neon/sku-catalog-queries';

interface CatalogByItemNumberCandidate {
  catalogId: number;
  sku: string;
  productTitle: string;
  imageUrl: string | null;
  category: string | null;
  kitPartCount: number;
  qcCheckCount: number;
  matchVia: 'platform_item_id' | 'sku' | 'direct_id';
}

type ResolveCatalogByItemNumberResult =
  | {
      status: 'resolved';
      itemNumber: string;
      catalog: CatalogByItemNumberCandidate;
    }
  | {
      status: 'ambiguous';
      itemNumber: string;
      candidates: CatalogByItemNumberCandidate[];
    }
  | {
      status: 'unresolved';
      itemNumber: string;
    };

function normalizeId(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function enrichCandidate(
  orgId: OrgId,
  catalogId: number,
  matchVia: CatalogByItemNumberCandidate['matchVia'],
): Promise<CatalogByItemNumberCandidate | null> {
  const catalog = await getSkuCatalogById(catalogId, orgId);
  if (!catalog) return null;

  const [kit, qc] = await Promise.all([
    tenantQuery<{ n: string }>(
      orgId,
      `SELECT COUNT(*)::text AS n FROM sku_kit_parts
        WHERE sku_catalog_id = $1 AND organization_id = $2`,
      [catalogId, orgId],
    ),
    tenantQuery<{ n: string }>(
      orgId,
      `SELECT COUNT(*)::text AS n FROM qc_check_templates
        WHERE sku_catalog_id = $1 AND organization_id = $2`,
      [catalogId, orgId],
    ),
  ]);

  return {
    catalogId: catalog.id,
    sku: catalog.sku,
    productTitle: catalog.product_title || catalog.sku,
    imageUrl: catalog.image_url,
    category: catalog.category,
    kitPartCount: Number(kit.rows[0]?.n ?? 0),
    qcCheckCount: Number(qc.rows[0]?.n ?? 0),
    matchVia,
  };
}

/**
 * Find every distinct catalog row linked to this item number (or exact SKU).
 */
async function listCatalogsForItemNumber(
  orgId: OrgId,
  itemNumber: string,
): Promise<CatalogByItemNumberCandidate[]> {
  const raw = itemNumber.trim();
  if (!raw) return [];

  const normalized = normalizeId(raw);
  const byId = new Map<number, CatalogByItemNumberCandidate['matchVia']>();

  // Platform crosswalk — may return multiple catalog ids.
  const platform = await tenantQuery<{ sku_catalog_id: number | null }>(
    orgId,
    `SELECT DISTINCT sku_catalog_id
       FROM sku_platform_ids
      WHERE organization_id = $1
        AND sku_catalog_id IS NOT NULL
        AND (
          regexp_replace(UPPER(TRIM(COALESCE(platform_item_id, ''))), '[^A-Z0-9]', '', 'g') = $2
          OR UPPER(TRIM(COALESCE(platform_item_id, ''))) = UPPER($3)
          OR regexp_replace(UPPER(TRIM(COALESCE(platform_sku, ''))), '[^A-Z0-9]', '', 'g') = $2
        )
      LIMIT 20`,
    [orgId, normalized, raw],
  );
  for (const row of platform.rows) {
    const id = Number(row.sku_catalog_id);
    if (Number.isFinite(id) && id > 0) byId.set(id, 'platform_item_id');
  }

  // Exact SKU match (operators often type the seller SKU into the same field).
  const skuHit = await getSkuCatalogBySku(raw, orgId);
  if (skuHit) byId.set(skuHit.id, byId.has(skuHit.id) ? byId.get(skuHit.id)! : 'sku');

  const enriched = await Promise.all(
    [...byId.entries()].map(([id, via]) => enrichCandidate(orgId, id, via)),
  );
  return enriched.filter((c): c is CatalogByItemNumberCandidate => c != null);
}

/**
 * Resolve one item number for checklist authoring.
 * Pass `catalogId` to skip lookup and load that catalog's summary directly
 * (deep-link / picker confirmation).
 */
export async function resolveCatalogByItemNumber(
  orgId: OrgId,
  args: { itemNumber?: string | null; catalogId?: number | null },
): Promise<ResolveCatalogByItemNumberResult | { status: 'invalid'; error: string }> {
  const catalogId =
    typeof args.catalogId === 'number' && Number.isFinite(args.catalogId) && args.catalogId > 0
      ? args.catalogId
      : null;
  const itemNumber = String(args.itemNumber || '').trim();

  if (catalogId != null) {
    const catalog = await enrichCandidate(orgId, catalogId, 'direct_id');
    if (!catalog) {
      return { status: 'invalid', error: 'SKU not found' };
    }
    return {
      status: 'resolved',
      itemNumber: itemNumber || catalog.sku,
      catalog,
    };
  }

  if (!itemNumber) {
    return { status: 'invalid', error: 'itemNumber is required' };
  }

  const candidates = await listCatalogsForItemNumber(orgId, itemNumber);
  if (candidates.length === 0) {
    // Last-chance single-id resolver (same normalize rules as ingest).
    const fallbackId = await resolveSkuCatalogByPlatformId(itemNumber, orgId);
    if (fallbackId) {
      const catalog = await enrichCandidate(orgId, fallbackId, 'platform_item_id');
      if (catalog) {
        return { status: 'resolved', itemNumber, catalog };
      }
    }
    return { status: 'unresolved', itemNumber };
  }
  if (candidates.length === 1) {
    return { status: 'resolved', itemNumber, catalog: candidates[0]! };
  }
  return { status: 'ambiguous', itemNumber, candidates };
}
