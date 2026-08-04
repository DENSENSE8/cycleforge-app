/**
 * Line thumb for Unbox Items / receiving grids.
 *
 * Prefer the Zoho item photo via `/api/zoho/items/{id}/image` when
 * `items.image_document_id` is set (Zoho sync stores a document id, not a CDN
 * URL). Fall back to `items.image_url` when present. Do NOT fall back to
 * `sc.image_url` when a Zoho item row exists — sku_catalog SKUs can collide
 * with Ecwid and show the wrong product. Catalog image only when there is no
 * Zoho item row (mirrors get-title-by-sku / sku-catalog search).
 */
export const RECEIVING_LINE_IMAGE_URL_SQL = `CASE
                  WHEN rz.zoho_item_id IS NOT NULL
                    AND EXISTS (
                      SELECT 1 FROM items i
                       WHERE i.zoho_item_id = rz.zoho_item_id
                         AND i.status = 'active'
                    )
                  THEN (
                    SELECT CASE
                      WHEN NULLIF(i.image_document_id, '') IS NOT NULL
                        THEN '/api/zoho/items/' || i.zoho_item_id || '/image'
                      ELSE NULLIF(i.image_url, '')
                    END
                    FROM items i
                    WHERE i.zoho_item_id = rz.zoho_item_id
                      AND i.status = 'active'
                    LIMIT 1
                  )
                  ELSE sc.image_url
                END AS image_url`;
