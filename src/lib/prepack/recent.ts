import 'server-only';

import { skuCatalogImageUrlSql } from '@/lib/photos/sku-catalog-image-sql';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { catalogChoiceOf, type CatalogChoiceRow } from './server';
import type { PrepackCatalogChoice } from './types';

/** Product template used by QC / pre-box unit stickers (same as `listQcLabels`). */
const QC_LABEL_TEMPLATE = 'product';

type RecentRow = Omit<CatalogChoiceRow, 'product_title'> & {
  catalog_product_title: string | null;
  zoho_item_title: string | null;
};

/**
 * "Recently printed": the catalog products whose QC label was printed most
 * recently, one row per product, newest print first. A printed QC label is
 * the `listQcLabels` predicate — a `product` template job on the unit, or on
 * the PREBOX manifest the unit belongs to. The unit's product is
 * `COALESCE(su.sku_catalog_id, sc.id)`, as on the QC labels page.
 */
export async function listRecentlyPrintedPrepackProducts(
  orgId: OrgId,
  limit = 30,
): Promise<PrepackCatalogChoice[]> {
  const { rows } = await tenantQuery<RecentRow>(
    orgId,
    `WITH jobs AS (
       SELECT j.serial_unit_id, j.created_at
         FROM label_print_jobs j
        WHERE j.organization_id = $1
          AND j.template_id = $2
          AND j.serial_unit_id IS NOT NULL
       UNION ALL
       SELECT mi.serial_unit_id, j.created_at
         FROM label_print_jobs j
         JOIN label_manifest_items mi
           ON mi.organization_id = j.organization_id AND mi.manifest_id = j.manifest_id
        WHERE j.organization_id = $1
          AND j.template_id = $2
          AND j.serial_unit_id IS NULL
          AND j.manifest_id IS NOT NULL
     ),
     printed AS (
       SELECT serial_unit_id, MAX(created_at) AS printed_at
         FROM jobs
        GROUP BY serial_unit_id
     ),
     recent AS (
       SELECT COALESCE(su.sku_catalog_id, sc.id) AS sku_catalog_id, MAX(p.printed_at) AS last_printed_at
         FROM printed p
         JOIN serial_units su ON su.id = p.serial_unit_id AND su.organization_id = $1
    LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('su')}
        WHERE COALESCE(su.sku_catalog_id, sc.id) IS NOT NULL
        GROUP BY 1
        ORDER BY last_printed_at DESC
        LIMIT $3
     )
     SELECT sc.id, sc.sku,
            sc.product_title AS catalog_product_title,
            (SELECT i.name FROM items i
              WHERE i.sku = sc.sku AND i.organization_id = sc.organization_id AND i.status = 'active'
              ORDER BY i.id LIMIT 1) AS zoho_item_title,
            ${skuCatalogImageUrlSql('sc')} AS image_url
       FROM recent r
       JOIN sku_catalog sc ON sc.id = r.sku_catalog_id AND sc.organization_id = $1
      ORDER BY r.last_printed_at DESC, sc.sku`,
    [orgId, QC_LABEL_TEMPLATE, Math.min(Math.max(Math.trunc(limit) || 30, 1), 100)],
  );
  return rows.map(({ catalog_product_title, zoho_item_title, ...row }) =>
    catalogChoiceOf({
      ...row,
      product_title: resolveSkuIdentityTitle({ catalog_product_title, zoho_item_title, sku: row.sku }) || row.sku,
    }),
  );
}
