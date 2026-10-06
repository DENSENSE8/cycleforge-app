/**
 * The ONE product-paperwork match predicate: which `product_manuals` rows
 * (manuals, packing lists, PL + M, inserts) resolve for an order line. The
 * print queue (`paperworkDocsSql`), the release gate G2 (`g2-paperwork-sql.ts`)
 * and the order's paperwork list (`order-manuals.ts`) all read it, so "has
 * paperwork" means the same thing on every surface.
 *
 * SQL twins of `normalizeIdentifier` / `paperworkSkuKey`
 * (`src/lib/manuals/paperwork-pairing.ts`).
 */

/** SQL twin of normalizeIdentifier: UPPER alnum, leading zeros stripped. */
export const idKeySql = (expr: string): string =>
  `regexp_replace(regexp_replace(UPPER(TRIM(COALESCE(${expr}, ''))), '[^A-Z0-9]', '', 'g'), '^0+', '')`;

/** SQL twin of paperworkSkuKey: UPPER alnum (zeros kept). */
export const skuKeySql = (expr: string): string => `regexp_replace(UPPER(TRIM(COALESCE(${expr}, ''))), '[^A-Z0-9]', '', 'g')`;

/**
 * The crosswalk keys one `sku_platform_ids` row (alias `sp`) answers to: its platform item id and platform SKU, as SKU keys.
 * Indexed per org (`2026-10-06_sku_platform_ids_crosswalk_key_indexes.sql`): the planner matches these expressions
 * structurally, so a change to {@link skuKeySql} needs a new migration re-creating both indexes.
 */
export const platformCrosswalkKeySqls = (sp: string): readonly [string, string] => [
  skuKeySql(`${sp}.platform_item_id`),
  skuKeySql(`${sp}.platform_sku`),
];

/**
 * One line's platform crosswalk, correlated: the lowest catalog id among the
 * org's mapped `sku_platform_ids` rows with a crosswalk key equal to `itemKey`.
 * Each OR arm is an index probe (org + key, partial on `sku_catalog_id IS NOT
 * NULL`) and the arms combine as a BitmapOr — keep the predicate in this shape.
 * A set-based caller (the print queue) computes the same thing once for all
 * its lines from {@link platformCrosswalkKeySqls}.
 */
export function platformCrosswalkCatalogIdSql({ org, itemKey }: { org: string; itemKey: string }): string {
  const [itemIdKey, platformSkuKey] = platformCrosswalkKeySqls('lcsp');
  return `(SELECT min(lcsp.sku_catalog_id)
     FROM sku_platform_ids lcsp
    WHERE lcsp.organization_id = ${org}
      AND lcsp.sku_catalog_id IS NOT NULL
      AND ${itemKey} <> ''
      AND (${itemIdKey} = ${itemKey} OR ${platformSkuKey} = ${itemKey}))`;
}

/**
 * The catalog id a line resolves paperwork by — its own `sku_catalog_id`,
 * else the org catalog row of its (trimmed) SKU text, else its item number's
 * platform crosswalk (`crosswalkCatalogId`: {@link platformCrosswalkCatalogIdSql}
 * or a set-based twin). The print queue and release gate G2 both resolve
 * through it. Every argument is a SQL expression. NULL when nothing resolves.
 */
export function lineCatalogIdSql({
  org,
  lineCatalogId,
  sku,
  crosswalkCatalogId,
}: {
  org: string;
  lineCatalogId: string;
  sku: string;
  crosswalkCatalogId: string;
}): string {
  return `COALESCE(
    ${lineCatalogId},
    (SELECT lcsc.id FROM sku_catalog lcsc
      WHERE lcsc.organization_id = ${org} AND NULLIF(TRIM(${sku}), '') IS NOT NULL AND lcsc.sku = TRIM(${sku})
      LIMIT 1),
    ${crosswalkCatalogId}
  )`;
}

/**
 * Every argument is a SQL expression. `pm` is the `product_manuals` alias;
 * the line keys are what the line resolves by: its `orders.id`, its item key
 * (`idKeySql` of the item number, `''` when absent), its catalog id (NULL when
 * unresolved) and its SKU key (`skuKeySql` of the SKU, `''` when absent).
 * Org scoping stays with the caller (`pm.organization_id = …`).
 */
export interface ProductPaperworkMatchKeys {
  pm: string;
  lineId: string;
  itemKey: string;
  catalogId: string;
  skuKey: string;
}

/** A live (active, assigned) row pinned to this line, its item number, or its SKU (catalog id, else SKU text). */
export function productPaperworkMatchSql({ pm, lineId, itemKey, catalogId, skuKey }: ProductPaperworkMatchKeys): string {
  return `(
         ${pm}.is_active = TRUE
     AND ${pm}.status = 'assigned'
     AND (
           ${pm}.order_id = ${lineId}
        OR (${itemKey} <> '' AND ${idKeySql(`${pm}.item_number`)} = ${itemKey})
        OR (${catalogId} IS NOT NULL AND ${pm}.sku_catalog_id = ${catalogId})
        OR (${skuKey} <> '' AND ${skuKeySql(`${pm}.sku`)} = ${skuKey})
     )
  )`;
}
