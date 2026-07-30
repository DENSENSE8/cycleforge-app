/**
 * catalog-projection — the local, priced, category-navigable mirror of a
 * provider storefront.
 *
 * ## Why this exists
 *
 * There is no sell price anywhere else in Postgres for these SKUs: `sku_catalog`
 * carries `last_known_cost_cents` (acquisition) and `replenish_target_cents`
 * (reorder trigger), neither of which is a sell price. So the counter could not
 * total a mixed cart without a live vendor round trip — and a cold repair-catalog
 * read walks ~2.5k products across the storefront. A consumer-facing form cannot
 * own that latency.
 *
 * ## The staleness contract — read this before "fixing" it into a live read
 *
 * **The projection is authoritative for DISPLAY. The provider is authoritative
 * for MONEY.** Catalog lines are charged by `catalog_object_id` and the provider
 * re-prices them at charge time, so a drifted local price can never overcharge a
 * customer — it can only show a stale number, and a charge rejected on drift
 * triggers a refresh. Turning this back into a live read would reintroduce the
 * ~16s cold walk on the one surface that cannot afford it.
 *
 * ## Shape fidelity
 *
 * The read functions return the SAME `EcwidProduct` / `EcwidCategory` shapes the
 * live vendor fetchers return, so `resolveRepairCategoryLevelFrom` and
 * `filterRepairRootProducts` — the pure halves in `ecwid-repair-catalog.ts` —
 * run unchanged over either source. `ProductSelector` and both
 * `ecwid-products` routes never learn where the rows came from.
 *
 * Price is stored in MINOR units (`listing_price_cents`, the column's contract)
 * and handed back in MAJOR units, because that is what the vendor API returns and
 * therefore what the response shape has always carried.
 */

import 'server-only';

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { EcwidCategory, EcwidProduct } from '@/lib/repair/ecwid-repair-catalog';

/** The one platform this projection serves today. */
const PROJECTION_PLATFORM = 'ecwid' as const;

/** A listing row as the projection writes it. */
export interface ProjectedListingInput {
  externalRefId: string;
  merchantSku: string;
  listedName: string;
  listingPriceCents: number | null;
  thumbnailUrl: string | null;
  inStock: boolean;
  isActive: boolean;
  categoryExternalIds: string[];
}

/** A category row as the projection writes it. */
export interface ProjectedCategoryInput {
  externalId: string;
  parentExternalId: string | null;
  name: string;
  fullPath: string;
  depth: number;
  sortOrder: number;
}

// ── Pure normalization ──────────────────────────────────────────────────────

/**
 * Major units → minor units.
 *
 * Rounds rather than truncates: `19.99 * 100` is `1998.9999…` in IEEE-754, and
 * truncation would quietly price it a cent low on every affected row.
 */
export function toMinorUnits(price: number | null | undefined): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  return Math.round(price * 100);
}

/** Minor units → major units, matching what the vendor API returns. */
export function toMajorUnits(cents: number | null | undefined): number | null {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return null;
  return cents / 100;
}

/** A provider product → the row the projection stores. */
export function toProjectedListing(product: EcwidProduct): ProjectedListingInput {
  return {
    externalRefId: product.id,
    merchantSku: product.sku,
    listedName: product.name,
    listingPriceCents: toMinorUnits(product.price),
    thumbnailUrl: product.thumbnailUrl,
    inStock: product.inStock,
    isActive: product.enabled,
    categoryExternalIds: [...new Set(product.categoryIds)],
  };
}

/** A stored row → the `EcwidProduct` shape every existing consumer expects. */
export function fromProjectedListing(row: {
  external_ref_id: string;
  merchant_sku: string | null;
  listed_name: string | null;
  listing_price_cents: number | null;
  thumbnail_url: string | null;
  in_stock: boolean;
  is_active: boolean;
  category_external_ids: string[] | null;
}): EcwidProduct {
  return {
    id: row.external_ref_id,
    name: row.listed_name?.trim() || `Product ${row.external_ref_id}`,
    sku: row.merchant_sku ?? '',
    price: toMajorUnits(row.listing_price_cents),
    thumbnailUrl: row.thumbnail_url,
    enabled: row.is_active,
    inStock: row.in_stock,
    categoryIds: row.category_external_ids ?? [],
  };
}

/**
 * Compute `depth` + `full_path` for every category, from the parent chain.
 *
 * Cycle-guarded per node: a provider that reports A→B→A would otherwise spin
 * forever here. A node whose chain loops keeps the partial path walked so far
 * rather than being dropped — a mis-parented category should still be
 * navigable, not invisible.
 */
export function buildProjectedCategories(categories: EcwidCategory[]): ProjectedCategoryInput[] {
  const byId = new Map<string, EcwidCategory>();
  for (const category of categories) {
    const id = asId(category.id);
    if (id) byId.set(id, category);
  }

  const rows: ProjectedCategoryInput[] = [];
  let sortOrder = 0;
  for (const [id, category] of byId) {
    const names: string[] = [];
    const seen = new Set<string>();
    let cursor: string | null = id;
    while (cursor) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const node = byId.get(cursor);
      if (!node) break;
      const name = String(node.name ?? '').trim();
      if (name) names.unshift(name);
      cursor = asId(node.parentId);
    }

    rows.push({
      externalId: id,
      parentExternalId: asId(category.parentId),
      name: String(category.name ?? '').trim() || `Category ${id}`,
      fullPath: names.join(' > '),
      depth: Math.max(0, names.length - 1),
      sortOrder: sortOrder++,
    });
  }
  return rows;
}

function asId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * Every projected category for this org, in the vendor's own shape so the
 * existing pure tree helpers consume it unchanged.
 *
 * An empty array means "nothing projected yet" — the caller falls back to the
 * live walk. It is deliberately indistinguishable from a genuinely empty
 * storefront: both should fall back, and neither should serve an empty picker.
 */
export async function loadProjectedCategories(orgId: OrgId): Promise<EcwidCategory[]> {
  const res = await tenantQuery<{
    external_id: string;
    parent_external_id: string | null;
    name: string;
  }>(
    orgId,
    `SELECT external_id, parent_external_id, name
       FROM platform_catalog_categories
      WHERE organization_id = $1 AND platform = $2 AND is_active
      ORDER BY sort_order, external_id`,
    [orgId, PROJECTION_PLATFORM],
  );
  return res.rows.map((row) => ({
    id: row.external_id,
    parentId: row.parent_external_id,
    name: row.name,
  }));
}

/** Every projected, active listing for this org, in the vendor's own shape. */
export async function loadProjectedListings(orgId: OrgId): Promise<EcwidProduct[]> {
  const res = await tenantQuery<{
    external_ref_id: string;
    merchant_sku: string | null;
    listed_name: string | null;
    listing_price_cents: number | null;
    thumbnail_url: string | null;
    in_stock: boolean;
    is_active: boolean;
    category_external_ids: string[] | null;
  }>(
    orgId,
    `SELECT external_ref_id, merchant_sku, listed_name, listing_price_cents,
            thumbnail_url, in_stock, is_active, category_external_ids
       FROM platform_listings
      WHERE organization_id = $1
        AND platform = $2
        AND is_active
        AND external_ref_id IS NOT NULL
      ORDER BY listed_name`,
    [orgId, PROJECTION_PLATFORM],
  );
  return res.rows.map(fromProjectedListing);
}

// NOTE: there is deliberately no `hasProjectedCatalog()` helper. The readers
// already distinguish "nothing projected" from "empty storefront" by the length
// of the rows they just fetched, so a separate existence probe would be a second
// round trip that answers a question the first one already answered.

// ── Writes ──────────────────────────────────────────────────────────────────

export interface ProjectionWriteResult {
  listingsUpserted: number;
  categoriesUpserted: number;
  listingsDeactivated: number;
  categoriesDeactivated: number;
}

/**
 * Replace this org's projection for one platform.
 *
 * UNNEST-batched: one statement per entity per run rather than N single-row
 * transactions, each of which would open its own BEGIN/set_config/COMMIT — the
 * exact per-row round-trip pattern that runs up Neon CU-hours.
 *
 * Rows the provider no longer reports are DEACTIVATED, not deleted. A listing id
 * can be referenced by a staged cart or an in-flight transaction, and a hard
 * delete would turn a stale reference into a dangling one mid-checkout. Marking
 * inactive also lets a provider blip that hides half the store be diagnosed
 * afterwards instead of silently erasing rows.
 */
export async function writeProjection(
  orgId: OrgId,
  listings: ProjectedListingInput[],
  categories: ProjectedCategoryInput[],
): Promise<ProjectionWriteResult> {
  return withTenantTransaction(orgId, async (client) => {
    const result: ProjectionWriteResult = {
      listingsUpserted: 0,
      categoriesUpserted: 0,
      listingsDeactivated: 0,
      categoriesDeactivated: 0,
    };

    if (categories.length > 0) {
      const res = await client.query(
        `INSERT INTO platform_catalog_categories
           (organization_id, platform, external_id, parent_external_id, name,
            full_path, depth, sort_order, is_active, synced_at, updated_at)
         SELECT $1, $2, t.external_id, t.parent_external_id, t.name,
                t.full_path, t.depth, t.sort_order, true, now(), now()
           FROM jsonb_to_recordset($3::jsonb) AS t(
             external_id text, parent_external_id text, name text,
             full_path text, depth int, sort_order int
           )
         ON CONFLICT (organization_id, platform, external_id) DO UPDATE SET
           parent_external_id = EXCLUDED.parent_external_id,
           name               = EXCLUDED.name,
           full_path          = EXCLUDED.full_path,
           depth              = EXCLUDED.depth,
           sort_order         = EXCLUDED.sort_order,
           is_active          = true,
           synced_at          = now(),
           updated_at         = now()`,
        // jsonb_to_recordset matches JSON KEYS to the declared column names, so
        // these must be snake_case — camelCase keys silently yield all-NULL rows.
        [
          orgId,
          PROJECTION_PLATFORM,
          JSON.stringify(
            categories.map((c) => ({
              external_id: c.externalId,
              parent_external_id: c.parentExternalId,
              name: c.name,
              full_path: c.fullPath,
              depth: c.depth,
              sort_order: c.sortOrder,
            })),
          ),
        ],
      );
      result.categoriesUpserted = res.rowCount ?? 0;

      const gone = await client.query(
        `UPDATE platform_catalog_categories
            SET is_active = false, updated_at = now()
          WHERE organization_id = $1 AND platform = $2 AND is_active
            AND external_id <> ALL($3::text[])`,
        [orgId, PROJECTION_PLATFORM, categories.map((c) => c.externalId)],
      );
      result.categoriesDeactivated = gone.rowCount ?? 0;
    }

    if (listings.length > 0) {
      const res = await client.query(
        `INSERT INTO platform_listings
           (organization_id, platform, external_ref_id, merchant_sku, listed_name,
            listing_price_cents, thumbnail_url, in_stock, is_active,
            category_external_ids, sync_status, last_synced_at, updated_at)
         SELECT $1, $2, t.external_ref_id, t.merchant_sku, t.listed_name,
                t.listing_price_cents, t.thumbnail_url, t.in_stock, t.is_active,
                COALESCE(t.category_external_ids, '{}'), 'SYNCED', now(), now()
           FROM jsonb_to_recordset($3::jsonb) AS t(
             external_ref_id text, merchant_sku text, listed_name text,
             listing_price_cents int, thumbnail_url text, in_stock boolean,
             is_active boolean, category_external_ids text[]
           )
         ON CONFLICT (organization_id, platform, external_ref_id)
           WHERE external_ref_id IS NOT NULL
         DO UPDATE SET
           merchant_sku          = EXCLUDED.merchant_sku,
           listed_name           = EXCLUDED.listed_name,
           listing_price_cents   = EXCLUDED.listing_price_cents,
           thumbnail_url         = EXCLUDED.thumbnail_url,
           in_stock              = EXCLUDED.in_stock,
           is_active             = EXCLUDED.is_active,
           category_external_ids = EXCLUDED.category_external_ids,
           sync_status           = 'SYNCED',
           sync_error            = NULL,
           last_synced_at        = now(),
           updated_at            = now()`,
        [
          orgId,
          PROJECTION_PLATFORM,
          JSON.stringify(
            listings.map((l) => ({
              external_ref_id: l.externalRefId,
              merchant_sku: l.merchantSku,
              listed_name: l.listedName,
              listing_price_cents: l.listingPriceCents,
              thumbnail_url: l.thumbnailUrl,
              in_stock: l.inStock,
              is_active: l.isActive,
              category_external_ids: l.categoryExternalIds,
            })),
          ),
        ],
      );
      result.listingsUpserted = res.rowCount ?? 0;

      const gone = await client.query(
        `UPDATE platform_listings
            SET is_active = false, updated_at = now()
          WHERE organization_id = $1 AND platform = $2 AND is_active
            AND external_ref_id IS NOT NULL
            AND external_ref_id <> ALL($3::text[])`,
        [orgId, PROJECTION_PLATFORM, listings.map((l) => l.externalRefId)],
      );
      result.listingsDeactivated = gone.rowCount ?? 0;
    }

    return result;
  });
}
