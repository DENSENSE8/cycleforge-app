import { listingCoverThumbUrlSql } from './listing-photos';

/**
 * A catalog product's photo as one SQL expression — the `productImageUrl`
 * precedence (owner decision 2026-09-29, our catalog first) for a row that IS
 * a `sku_catalog` row: the catalog image, the listing-gallery cover, the SKU's
 * own catalog photo (the "Catalog photo" a prepack takes), then the active Zoho
 * item's image. NULL when nothing knows one — the caller paints initials.
 *
 * `sc` = the `sku_catalog` alias in the caller's query.
 */
export function skuCatalogImageUrlSql(sc: string): string {
  return `COALESCE(
      NULLIF(BTRIM(${sc}.image_url), ''),
      ${listingCoverThumbUrlSql(sc)},
      (SELECT '/api/photos/' || link.photo_id::text || '/content?variant=thumb'
         FROM photo_entity_links link
        WHERE link.organization_id = ${sc}.organization_id
          AND link.entity_type = 'SKU' AND link.entity_id = ${sc}.id
        ORDER BY link.sort_order ASC NULLS LAST, link.photo_id ASC
        LIMIT 1),
      (SELECT '/api/zoho/items/' || i.zoho_item_id || '/image'
         FROM items i
        WHERE i.organization_id = ${sc}.organization_id AND i.sku = ${sc}.sku
          AND i.status = 'active' AND NULLIF(i.image_document_id, '') IS NOT NULL
        ORDER BY i.id
        LIMIT 1)
    )`;
}
