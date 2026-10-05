import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { skuCatalogTitleUnownedPredicateSql } from '@/lib/sku/sku-identity-law';

const ECWID_BASE_URL = 'https://app.ecwid.com/api/v3';

function requiredEnvAny(primaryName: string, aliases: string[] = []): string {
  for (const key of [primaryName, ...aliases]) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  throw new Error(`Missing required environment variable: ${primaryName}`);
}

/** POST /api/sku-catalog/sync-ecwid-titles */
export const POST = withAuth(async (_req: NextRequest, ctx) => {
  const storeId = requiredEnvAny('ECWID_STORE_ID', ['ECWID_STOREID', 'ECWID_STORE', 'NEXT_PUBLIC_ECWID_STORE_ID']);
  const token = requiredEnvAny('ECWID_API_TOKEN', ['ECWID_TOKEN', 'ECWID_ACCESS_TOKEN', 'NEXT_PUBLIC_ECWID_API_TOKEN']);

  // Fetch all products from Ecwid (paginate)
  const allProducts: Array<{ sku: string; name: string; thumbnailUrl: string | null }> = [];
  let offset = 0;
  const limit = 100;
  const maxPages = 50;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${ECWID_BASE_URL}/${storeId}/products`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('enabled', 'true');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ecwid fetch failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    for (const item of items) {
      const sku = String(item.sku || '').trim();
      const name = String(item.name || '').trim();
      if (sku && name) {
        allProducts.push({
          sku,
          name,
          thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
        });
      }
    }

    if (items.length < limit) break;
    offset += limit;
  }

  if (allProducts.length === 0) {
    return NextResponse.json({ success: true, matched: 0, updated: 0, message: 'No Ecwid products found' });
  }

  // Batch update sku_catalog where SKU matches AND Zoho does not own the row
  let updated = 0;
  for (const product of allProducts) {
    // sku is a per-tenant string key — scope the title update to this org so
    // a colliding SKU in another tenant is never overwritten.
    const result = await tenantQuery(
      ctx.organizationId,
      `UPDATE sku_catalog
         SET product_title = $1,
             image_url = COALESCE(image_url, $2::text),
             updated_at = NOW()
         WHERE sku = $3
           AND organization_id = $4
           AND ${skuCatalogTitleUnownedPredicateSql()}
           AND (product_title IS DISTINCT FROM $1 OR (image_url IS NULL AND $2::text IS NOT NULL))`,
      [product.name, product.thumbnailUrl, product.sku, ctx.organizationId],
    );
    if (result.rowCount && result.rowCount > 0) updated++;
  }

  // `sku_catalog` is the shared internal catalog, not an Ecwid mirror. A SKU
  // absent from one sales channel can still be an active Zoho / warehouse
  // identity, so this sync may never deactivate it. Ecwid liveness belongs on
  // its own `sku_platform_ids` mapping.
  const deactivatedCount: number = 0;

  // Titles/images changed → bust cached get-title-by-sku bundles for this org.
  await invalidateCacheTags(ctx.organizationId, [CACHE_TAGS.skuCatalog]);

  return NextResponse.json({
    success: true,
    matched: allProducts.length,
    updated,
    deactivated: deactivatedCount,
    message: `Synced ${updated} title${updated !== 1 ? 's' : ''}, deactivated ${deactivatedCount} non-Ecwid SKU${deactivatedCount !== 1 ? 's' : ''}`,
  });
}, { permission: 'admin.manage_features' });
