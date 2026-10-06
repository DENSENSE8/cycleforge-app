/**
 * Release gate **G2** (paperwork) for one `orders` line row `o` — the ONE
 * definition the cage (`caged-orders.ts`), the Exceptions hub
 * (`order-exceptions.ts`), the print packet (`print-packet.ts`) and the
 * paperwork exception read. Operator ruling 2026-10-05: "has paperwork" is the
 * print queue's product-paperwork match (`productPaperworkMatchSql`), so an
 * order the Labels & docs queue shows with paperwork is never caged on G2.
 *
 * A line's paperwork =
 *   documents linked to the line (`document_entity_links` ORDER → o.id), any
 *   type but a shipping label (packing slips, invoices, …)
 *   + live `product_manuals` rows pinned to the line, its item number, or its
 *   SKU (catalog id resolved by `lineCatalogIdSql`, exactly as the print queue
 *   resolves it; else SKU text).
 *
 * The exemptions are separate facts so the gate's copy stays honest:
 * `orders.docs_not_required` (this order) and
 * {@link G2_SKU_PAPERWORK_NOT_REQUIRED_SQL} (`sku_catalog.paperwork_not_required`).
 */

import {
  idKeySql,
  lineCatalogIdSql,
  platformCrosswalkCatalogIdSql,
  productPaperworkMatchSql,
  skuKeySql,
} from '@/lib/manuals/paperwork-match-sql';

/** The line's catalog id — same resolution as `paperworkDocsSql`'s `keys.catalog_id`. */
const G2_LINE_CATALOG_ID_SQL = lineCatalogIdSql({
  org: 'o.organization_id',
  lineCatalogId: 'o.sku_catalog_id',
  sku: 'o.sku',
  crosswalkCatalogId: platformCrosswalkCatalogIdSql({ org: 'o.organization_id', itemKey: idKeySql('o.item_number') }),
});

/** Non-label documents linked to the line row. */
const G2_LINKED_DOCUMENTS_FROM_SQL = `FROM document_entity_links g2l
    JOIN documents g2d
      ON g2d.id = g2l.document_id
     AND g2d.organization_id = g2l.organization_id
   WHERE g2l.organization_id = o.organization_id
     AND g2l.entity_type = 'ORDER'
     AND g2l.entity_id = o.id
     AND COALESCE(g2d.document_type, '') <> 'shipping_label'`;

/** Product paperwork resolved for the line — keys computed once per row. */
const G2_PRODUCT_PAPERWORK_FROM_SQL = `FROM (VALUES (
           o.id,
           ${idKeySql('o.item_number')},
           ${G2_LINE_CATALOG_ID_SQL},
           ${skuKeySql('o.sku')}
         )) AS g2k(line_id, item_key, catalog_id, sku_key)
    JOIN product_manuals g2pm
      ON g2pm.organization_id = o.organization_id
     AND ${productPaperworkMatchSql({
       pm: 'g2pm',
       lineId: 'g2k.line_id',
       itemKey: 'g2k.item_key',
       catalogId: 'g2k.catalog_id',
       skuKey: 'g2k.sku_key',
     })}`;

/** How much G2 paperwork the line has (linked documents + product paperwork). */
export const G2_DOCUMENT_COUNT_SQL = `(
  (SELECT COUNT(*)::int ${G2_LINKED_DOCUMENTS_FROM_SQL})
  + (SELECT COUNT(*)::int ${G2_PRODUCT_PAPERWORK_FROM_SQL})
)`;

/** The line has any G2 paperwork — {@link G2_DOCUMENT_COUNT_SQL} > 0 as cheap probes. */
export const G2_DOCUMENT_EXISTS_SQL = `(
  EXISTS (SELECT 1 ${G2_LINKED_DOCUMENTS_FROM_SQL})
  OR EXISTS (SELECT 1 ${G2_PRODUCT_PAPERWORK_FROM_SQL})
)`;

/**
 * The line's catalog SKU (resolved as above) never ships with product
 * paperwork (`sku_catalog.paperwork_not_required`) — the SKU-level G2 exemption.
 */
export const G2_SKU_PAPERWORK_NOT_REQUIRED_SQL = `EXISTS (
  SELECT 1
    FROM sku_catalog g2nr
   WHERE g2nr.organization_id = o.organization_id
     AND g2nr.paperwork_not_required = TRUE
     AND g2nr.id = ${G2_LINE_CATALOG_ID_SQL}
)`;
