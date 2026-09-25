/**
 * ShipStation store → org platform catalog placement.
 *
 * ShipStation aggregates every storefront the warehouse sells on; its `/stores`
 * list carries each store's marketplace ('eBay', 'Amazon', 'Shopify', …). Each
 * store is placed ONCE, as an `integration_store_links` row on a catalog
 * platform (`./integration-store-links.ts`):
 *
 *   • a LINKED store is never touched — the operator's placement (Settings →
 *     Platforms & Types / the ShipStation connection page) is final, and no
 *     platform or account is ever created for it;
 *   • an UNLINKED store is linked to the platform its marketplace names. That
 *     platform is reused when the org already has it (eBay/Amazon/Walmart/Ecwid);
 *     a marketplace the org has never cataloged is added with
 *     `provider='shipstation'` so its orders display, and the operator can
 *     re-point the store later.
 *
 * Never creates `platform_accounts`: a storefront account is only ever one the
 * operator already has and names on the link.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { invalidateCatalogCache } from '@/lib/catalog/org-catalog';
import { SHIPSTATION_STORE_PROVIDER } from '@/lib/catalog/integration-store-links';
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
  'ecwid by lightspeed': 'ecwid',
  sqonline: 'square',
  'square online': 'square',
};

/**
 * ShipStation's own channels — manual orders, the label API, the rate browser.
 * They are ShipStation plumbing, not sales platforms: never mirrored into the
 * catalog, and an order from one cannot be attributed to a platform.
 */
const SHIPSTATION_INTERNAL_MARKETPLACES = new Set(['shipstation', 'label api', 'ratebrowser']);

export function isShipStationInternalStore(store: Pick<ShipStationV1Store, 'marketplace' | 'marketplaceName'>): boolean {
  const key = String(store.marketplace ?? store.marketplaceName ?? '').trim().toLowerCase();
  return SHIPSTATION_INTERNAL_MARKETPLACES.has(key);
}

export function shipstationMarketplaceSlug(store: Pick<ShipStationV1Store, 'marketplace' | 'marketplaceName'>): string | null {
  if (isShipStationInternalStore(store)) return null;
  const key = String(store.marketplace ?? store.marketplaceName ?? '').trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  return KNOWN_MARKETPLACE_SLUGS[lower] ?? slugify(lower);
}

export interface StoreCatalogSyncResult {
  platformsAdded: number;
  storesLinked: number;
}

/**
 * The stores this sync places: not yet linked, and on a sales marketplace
 * (ShipStation's own channels are never placed). A linked store is absent by
 * construction — its placement belongs to the operator.
 */
export function storesToPlace<S extends Pick<ShipStationV1Store, 'storeId' | 'marketplace' | 'marketplaceName'>>(
  stores: readonly S[],
  linkedStoreIds: ReadonlySet<string>,
): Array<{ store: S; slug: string }> {
  return stores.flatMap((store) => {
    if (linkedStoreIds.has(String(store.storeId))) return [];
    const slug = shipstationMarketplaceSlug(store);
    return slug ? [{ store, slug }] : [];
  });
}

/**
 * Link every unlinked store to its marketplace's platform. One tenant
 * transaction; additive only — an existing platform or link is never renamed,
 * recoloured or re-pointed. Fires `invalidateCatalogCache` when it placed
 * anything so every instance's picker cache refreshes.
 */
export async function syncShipStationStoresToCatalog(
  orgId: OrgId,
  stores: ShipStationV1Store[],
): Promise<StoreCatalogSyncResult> {
  const result: StoreCatalogSyncResult = { platformsAdded: 0, storesLinked: 0 };
  if (stores.length === 0) return result;

  await withTenantTransaction(orgId, async (client) => {
    const linked = await client.query<{ external_store_id: string }>(
      `SELECT external_store_id FROM integration_store_links
        WHERE organization_id = $1 AND provider = $2`,
      [orgId, SHIPSTATION_STORE_PROVIDER],
    );
    const toPlace = storesToPlace(stores, new Set(linked.rows.map((r) => r.external_store_id)));

    const platformIds = new Map<string, number>();
    for (const { store, slug } of toPlace) {
      let platformId = platformIds.get(slug);
      if (platformId == null) {
        const label =
          String(store.marketplaceName ?? '').trim() || String(store.marketplace ?? '').trim() || slug;
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO platforms (organization_id, slug, label, provider, sort_order)
           VALUES ($1, $2, $3, 'shipstation', 80)
           ON CONFLICT (organization_id, slug) DO NOTHING
           RETURNING id`,
          [orgId, slug, label],
        );
        if (inserted.rows.length > 0) result.platformsAdded++;
        const row =
          inserted.rows[0] ??
          (
            await client.query<{ id: number }>(
              `SELECT id FROM platforms WHERE organization_id = $1 AND slug = $2`,
              [orgId, slug],
            )
          ).rows[0];
        if (!row) continue;
        platformId = Number(row.id);
        platformIds.set(slug, platformId);
      }
      const link = await client.query(
        `INSERT INTO integration_store_links (organization_id, provider, external_store_id, platform_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, provider, external_store_id) DO NOTHING
         RETURNING id`,
        [orgId, SHIPSTATION_STORE_PROVIDER, String(store.storeId), platformId],
      );
      if (link.rows.length > 0) result.storesLinked++;
    }
  });

  if (result.platformsAdded > 0 || result.storesLinked > 0) invalidateCatalogCache(orgId);
  return result;
}
