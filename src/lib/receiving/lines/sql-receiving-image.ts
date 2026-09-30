import { listingCoverThumbUrlSql } from '@/lib/photos/listing-photos';

/**
 * Line thumb for Unbox Items / receiving grids / the inbound record — the
 * `productImageUrl` rule in SQL (owner decision 2026-09-29, our catalog
 * first): the catalog photo, then the SKU listing-gallery cover, then the
 * active Zoho item's image. Needs `sc` (sku_catalog) and `rz`
 * (receiving_line_zoho) in scope.
 */
export const RECEIVING_LINE_IMAGE_URL_SQL = `COALESCE(
                  NULLIF(BTRIM(sc.image_url), ''),
                  ${listingCoverThumbUrlSql('sc')},
                  (SELECT CASE
                            WHEN NULLIF(i.image_document_id, '') IS NOT NULL
                              THEN '/api/zoho/items/' || i.zoho_item_id || '/image'
                            ELSE NULLIF(i.image_url, '')
                          END
                     FROM items i
                    WHERE i.zoho_item_id = rz.zoho_item_id
                      AND i.status = 'active'
                    LIMIT 1)
                ) AS image_url`;
