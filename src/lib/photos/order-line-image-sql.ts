/**
 * The product photo of one order line, as one SQL expression — the Shipped
 * package lines read it so a shipped box paints the same photo its Allocate
 * card did. It mirrors, tier for tier, the `catalog_image_url` COALESCE in
 * `src/lib/orders/orders-list.ts` (the precedence law); that hot read keeps its
 * own planner-tuned laterals until a benchmarked cutover onto this fragment.
 *
 *   1. the catalog row's own image (`sku_catalog.image_url`)
 *   2. the SKU's listing-gallery cover — a product photo uploaded on a record,
 *      or the eBay / Amazon / Shopify / Ecwid media the backfill landed
 *   3. the Ecwid product mirror (`sku_platform_ids.image_url`)
 *   4. a listing photo linked to the order itself (unpaired lines)
 *   5. the line image the ShipStation order carried
 * The catalog row is the paired FK, else the exact org-scoped SKU. A Zoho item
 * image is not a URL here — `productImageUrl` layers it in JS from the Zoho ids.
 */
import { listingCoverThumbUrlSql } from './listing-photos';

/** `o` = the `orders` alias in the caller's query. */
export function orderLineImageSql(o: string): string {
  const catalog = `(SELECT sc_img.id FROM sku_catalog sc_img
                     WHERE sc_img.organization_id = ${o}.organization_id
                       AND (sc_img.id = ${o}.sku_catalog_id
                            OR (${o}.sku_catalog_id IS NULL AND NULLIF(BTRIM(${o}.sku), '') IS NOT NULL AND sc_img.sku = ${o}.sku))
                     ORDER BY (sc_img.id = ${o}.sku_catalog_id) DESC NULLS LAST
                     LIMIT 1)`;
  return `COALESCE(
      (SELECT NULLIF(BTRIM(sc_i.image_url), '') FROM sku_catalog sc_i
        WHERE sc_i.organization_id = ${o}.organization_id AND sc_i.id = ${catalog}),
      (SELECT ${listingCoverThumbUrlSql('sc_c')} FROM sku_catalog sc_c
        WHERE sc_c.organization_id = ${o}.organization_id AND sc_c.id = ${catalog}),
      (SELECT NULLIF(BTRIM(sp.image_url), '') FROM sku_platform_ids sp
        WHERE sp.organization_id = ${o}.organization_id
          AND sp.platform = 'ecwid' AND sp.is_active
          AND NULLIF(BTRIM(sp.image_url), '') IS NOT NULL
          AND (sp.sku_catalog_id = ${o}.sku_catalog_id OR sp.platform_sku = ${o}.sku)
        ORDER BY sp.created_at DESC NULLS LAST, sp.id DESC
        LIMIT 1),
      (SELECT COALESCE(
                (SELECT NULLIF(BTRIM(ps.legacy_url), '') FROM photo_storage ps
                  WHERE ps.organization_id = pel.organization_id AND ps.photo_id = pel.photo_id
                    AND ps.provider = 'legacy_url' AND ps.is_primary
                  LIMIT 1),
                '/api/photos/' || pel.photo_id::text || '/content?variant=thumb')
         FROM photo_entity_links pel
         JOIN photos p ON p.id = pel.photo_id AND p.organization_id = pel.organization_id
        WHERE pel.organization_id = ${o}.organization_id
          AND pel.entity_type = 'ORDER' AND pel.entity_id = ${o}.id
          AND p.photo_type = 'listing'
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 1),
      (SELECT NULLIF(BTRIM(line.item->>'imageUrl'), '')
         FROM shipstation_order_refs ssr,
              jsonb_array_elements(COALESCE(ssr.line_items, '[]'::jsonb)) WITH ORDINALITY AS line(item, ordinal)
        WHERE ssr.organization_id = ${o}.organization_id AND ssr.order_row_id = ${o}.id
          AND COALESCE(line.item->>'adjustment', 'false') <> 'true'
          AND NULLIF(BTRIM(line.item->>'imageUrl'), '') IS NOT NULL
        ORDER BY ssr.last_seen_at DESC NULLS LAST,
                 CASE WHEN UPPER(BTRIM(line.item->>'sku')) = UPPER(BTRIM(${o}.sku)) THEN 0 ELSE 1 END,
                 line.ordinal
        LIMIT 1)
    )`;
}
