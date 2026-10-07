/**
 * Catalog items import — the database side of `catalog-import.ts`: what the
 * planner reads (this org's catalog titles and Zoho items mirror ids) and the
 * one transaction that adds a plan's new SKUs.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import {
  catalogImportLookupSkus,
  planCatalogImport,
  type CatalogImportContext,
  type CatalogImportInputRow,
  type CatalogImportPlan,
} from './catalog-import';

/** The crosswalk `source` of a row this import wrote (`catalog_external_ids.source`). */
export const CATALOG_IMPORT_SOURCE = 'catalog-import';

export async function readCatalogImportContext(orgId: OrgId, skus: readonly string[]): Promise<CatalogImportContext> {
  if (skus.length === 0) return { catalogTitles: new Map(), mirrorItemIds: new Map(), paddingTwins: new Map() };
  const [catalog, mirror, twins] = await Promise.all([
    tenantQuery<{ sku: string; product_title: string }>(
      orgId,
      `SELECT sku, product_title FROM sku_catalog WHERE organization_id = $1 AND sku = ANY($2::text[])`,
      [orgId, skus],
    ),
    tenantQuery<{ sku: string; zoho_item_id: string }>(
      orgId,
      `SELECT DISTINCT ON (btrim(sku)) btrim(sku) AS sku, btrim(zoho_item_id) AS zoho_item_id
         FROM items
        WHERE organization_id = $1 AND btrim(sku) = ANY($2::text[])
          AND NULLIF(btrim(zoho_item_id), '') IS NOT NULL
        ORDER BY btrim(sku), (status = 'active') DESC, updated_at DESC`,
      [orgId, skus],
    ),
    // Same canonical key (fn_normalize_sku, indexed), different spelling.
    tenantQuery<{ input: string; sku: string }>(
      orgId,
      `SELECT x.input, sc.sku
         FROM unnest($2::text[]) AS x(input)
         JOIN sku_catalog sc
           ON sc.organization_id = $1
          AND fn_normalize_sku(sc.sku) = fn_normalize_sku(x.input)
          AND sc.sku <> x.input
        ORDER BY x.input, sc.sku`,
      [orgId, skus],
    ),
  ]);
  const paddingTwins = new Map<string, string[]>();
  for (const row of twins.rows) {
    const list = paddingTwins.get(row.input);
    if (list) list.push(row.sku);
    else paddingTwins.set(row.input, [row.sku]);
  }
  return {
    catalogTitles: new Map(catalog.rows.map((row) => [row.sku, row.product_title])),
    mirrorItemIds: new Map(mirror.rows.map((row) => [row.sku, row.zoho_item_id])),
    paddingTwins,
  };
}

export async function planCatalogImportFor(orgId: OrgId, rows: readonly CatalogImportInputRow[]): Promise<CatalogImportPlan> {
  return planCatalogImport(rows, await readCatalogImportContext(orgId, catalogImportLookupSkus(rows)));
}

export interface CatalogImportApplied {
  /** Catalog ids this import created. */
  insertedIds: number[];
  crosswalk: number;
}

/**
 * Add the plan's `new` SKUs (title, UPC, EAN) and record each one's Zoho item
 * id. A SKU another writer added since the plan is skipped, never retitled.
 */
export async function applyCatalogImport(orgId: OrgId, plan: CatalogImportPlan): Promise<CatalogImportApplied> {
  const fresh = plan.rows.filter((row) => row.outcome === 'new');
  if (fresh.length === 0) return { insertedIds: [], crosswalk: 0 };
  return withTenantTransaction(orgId, async (client) => {
    const inserted = await client.query<{ id: number; sku: string }>(
      `INSERT INTO sku_catalog (organization_id, sku, product_title, upc, ean)
       SELECT $1, n.sku, n.title, n.upc, n.ean
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS n(sku, title, upc, ean)
       ON CONFLICT (organization_id, sku) DO NOTHING
       RETURNING id, sku`,
      [orgId, fresh.map((r) => r.sku), fresh.map((r) => r.title), fresh.map((r) => r.upc), fresh.map((r) => r.ean)],
    );
    const idBySku = new Map(inserted.rows.map((row) => [row.sku, Number(row.id)]));
    const linked = fresh.filter((row) => row.zohoItemId && idBySku.has(row.sku));
    const crosswalk = linked.length
      ? await client.query(
          `INSERT INTO catalog_external_ids (organization_id, sku_catalog_id, provider, external_id, external_sku, external_name, source)
           SELECT $1, x.id, 'zoho', x.external_id, x.sku, x.name, $6
             FROM unnest($2::int[], $3::text[], $4::text[], $5::text[]) AS x(id, external_id, sku, name)
           ON CONFLICT (organization_id, provider, external_id) DO NOTHING`,
          [
            orgId,
            linked.map((r) => idBySku.get(r.sku)!),
            linked.map((r) => r.zohoItemId!),
            linked.map((r) => r.sku),
            linked.map((r) => r.title),
            CATALOG_IMPORT_SOURCE,
          ],
        )
      : null;
    return { insertedIds: [...idBySku.values()], crosswalk: crosswalk?.rowCount ?? 0 };
  });
}

/** Record one catalog item's Zoho id (Products › Add product). An id already linked elsewhere is left as is. */
export async function linkCatalogZohoItem(
  orgId: OrgId,
  item: { skuCatalogId: number; sku: string; title: string; zohoItemId: string },
): Promise<boolean> {
  const { rowCount } = await tenantQuery(
    orgId,
    `INSERT INTO catalog_external_ids (organization_id, sku_catalog_id, provider, external_id, external_sku, external_name, source)
     VALUES ($1, $2, 'zoho', $3, $4, $5, 'manual')
     ON CONFLICT (organization_id, provider, external_id) DO NOTHING`,
    [orgId, item.skuCatalogId, item.zohoItemId, item.sku, item.title],
  );
  return (rowCount ?? 0) > 0;
}
