/**
 * ShipStation store → org platform catalog sync.
 *
 * ShipStation aggregates every storefront the warehouse sells on; its `/stores`
 * list carries each store's marketplace ('eBay', 'Amazon', 'Shopify', …). The
 * unbox platform picker reads the org catalog (`platforms` / `platform_accounts`),
 * so mirroring those marketplaces in makes "the platforms we're already
 * integrated with" appear as classify options without any manual entry —
 * eBay/Amazon/Walmart rows already exist and are reused (ON CONFLICT DO
 * NOTHING); a marketplace the org has never cataloged is added with
 * `provider='shipstation'` so its provenance is visible in the catalog manager.
 *
 * Idempotent by construction: re-running a sync never renames, recolours, or
 * reorders anything an operator has customized — it only adds missing rows.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { invalidateCatalogCache } from '@/lib/catalog/org-catalog';
import { slugify } from '@/lib/neon/catalog-queries';
import type { ShipStationV1Store } from '@/lib/shipping/shipstation/orders-v1';

/**
 * Marketplaces whose catalog slug predates this sync. Everything else slugs
 * from its ShipStation name, so a storefront on a niche marketplace still
 * classifies — just with a generated slug.
 */
const KNOWN_MARKETPLACE_SLUGS: Record<string, string> = {
  ebay: 'ebay',
  amazon: 'amazon',
  walmart: 'walmart',
  shopify: 'shopify',
  bigcommerce: 'bigcommerce',
  woocommerce: 'woocommerce',
  etsy: 'etsy',
  ecwid: 'ecwid',
  sqonline: 'square',
  'square online': 'square',
};

export function shipstationMarketplaceSlug(store: ShipStationV1Store): string | null {
  const key = String(store.marketplace ?? store.marketplaceName ?? '').trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  return KNOWN_MARKETPLACE_SLUGS[lower] ?? slugify(lower);
}

export interface StoreCatalogSyncResult {
  platformsAdded: number;
  accountsAdded: number;
}

/**
 * Mirror the connected stores into the org's platform catalog. One tenant
 * transaction; additive only. Callers should fire `invalidateCatalogCache`
 * after (done here on success) so every instance's picker cache refreshes.
 */
export async function syncShipStationStoresToCatalog(
  orgId: OrgId,
  stores: ShipStationV1Store[],
): Promise<StoreCatalogSyncResult> {
  const result: StoreCatalogSyncResult = { platformsAdded: 0, accountsAdded: 0 };
  if (stores.length === 0) return result;

  await withTenantTransaction(orgId, async (client) => {
    // Distinct marketplaces → platform rows (slug deduped, known slugs reused).
    const bySlug = new Map<string, { label: string }>();
    for (const store of stores) {
      const slug = shipstationMarketplaceSlug(store);
      if (!slug) continue;
      const label =
        String(store.marketplaceName ?? '').trim() ||
        String(store.marketplace ?? '').trim() ||
        slug;
      if (!bySlug.has(slug)) bySlug.set(slug, { label });
    }

    const platformIds = new Map<string, number>();
    for (const [slug, { label }] of bySlug) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO platforms (organization_id, slug, label, provider, sort_order)
         VALUES ($1, $2, $3, 'shipstation', 80)
         ON CONFLICT (organization_id, slug) DO NOTHING
         RETURNING id`,
        [orgId, slug, label],
      );
      if (inserted.rows.length > 0) {
        result.platformsAdded++;
        platformIds.set(slug, Number(inserted.rows[0].id));
        continue;
      }
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM platforms WHERE organization_id = $1 AND slug = $2`,
        [orgId, slug],
      );
      if (existing.rows.length > 0) platformIds.set(slug, Number(existing.rows[0].id));
    }

    // One platform_account per store, so the type → account → platform chain
    // can reach the specific ShipStation storefront.
    for (const store of stores) {
      const slug = shipstationMarketplaceSlug(store);
      const platformId = slug ? platformIds.get(slug) : undefined;
      if (!platformId) continue;
      const accountSlug = `shipstation-${store.storeId}`;
      const label =
        String(store.storeName ?? '').trim() ||
        `ShipStation ${String(store.marketplaceName ?? store.marketplace ?? '').trim() || store.storeId}`;
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO platform_accounts (organization_id, platform_id, slug, label, integration_scope, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (organization_id, platform_id, slug) DO NOTHING
         RETURNING id`,
        [orgId, platformId, accountSlug, label, String(store.storeId)],
      );
      if (inserted.rows.length > 0) result.accountsAdded++;
    }
  });

  invalidateCatalogCache(orgId);
  return result;
}
