/**
 * The lead line of each painted in-person record that is not an order (an
 * order-backed one — a counter-pickup order — dresses through the outbound
 * order lines). `$1` org, `$2` local pickup order ids, `$3` counter visit
 * ids, `$4` Square sale ids. A pickup's / visit's lead is its first entered
 * line; a Square sale's its first `line_items` entry. Titles follow the SKU
 * identity law (catalog, then Zoho, then the line's own words).
 */

import 'server-only';
import { listingCoverThumbUrlSql } from '@/lib/photos/listing-photos';
import { skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';

/** The Zoho item title of the joined catalog row `sc`. */
const ZOHO_TITLE_SQL = `(SELECT x.external_name FROM catalog_external_ids x
        WHERE x.sku_catalog_id = sc.id AND x.organization_id = sc.organization_id AND x.provider = 'zoho'
        ORDER BY x.id LIMIT 1)`;

/** Our catalog photo first, then the line's own. */
const PHOTO_SQL = (own: string) => `COALESCE(NULLIF(BTRIM(sc.image_url), ''), ${listingCoverThumbUrlSql('sc')}, ${own})`;

export const IN_PERSON_LINES_SQL = `
  SELECT 'LOCAL_PICKUP'::text AS sub, lpi.order_id::text AS record_id,
         lpi.sku, lpi.product_title AS item_name, sc.product_title AS catalog_product_title,
         ${ZOHO_TITLE_SQL} AS zoho_item_title,
         lpi.quantity::numeric AS quantity, lpi.condition_grade AS condition,
         lpi.total_price::numeric AS amount, 'USD'::text AS currency,
         ${PHOTO_SQL(`NULLIF(BTRIM(lpi.image_url), '')`)} AS image_url
    FROM (
      SELECT DISTINCT ON (i.order_id) i.*
        FROM local_pickup_order_items i
       WHERE i.organization_id = $1 AND i.order_id = ANY($2::int[])
       ORDER BY i.order_id, i.id
    ) lpi
    LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('lpi', 'sc')}
  UNION ALL
  SELECT 'COUNTER'::text, ctl.counter_transaction_id::text,
         ctl.sku, ctl.title, sc.product_title,
         ${ZOHO_TITLE_SQL},
         ctl.quantity::numeric, NULL::text,
         (ctl.unit_amount_cents * ctl.quantity / 100.0)::numeric, 'USD'::text,
         ${PHOTO_SQL('NULL::text')}
    FROM (
      SELECT DISTINCT ON (l.counter_transaction_id) l.*
        FROM counter_transaction_lines l
       WHERE l.organization_id = $1 AND l.counter_transaction_id = ANY($3::bigint[])
       ORDER BY l.counter_transaction_id, l.sort_index, l.id
    ) ctl
    LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('ctl', 'sc')}
  UNION ALL
  SELECT 'SQUARE'::text, s.id::text,
         NULLIF(BTRIM(s.line_items->0->>'sku'), ''), s.line_items->0->>'name', sc.product_title,
         ${ZOHO_TITLE_SQL},
         NULLIF(s.line_items->0->>'quantity', '')::numeric, NULL::text,
         (s.total / 100.0)::numeric, 'USD'::text,
         ${PHOTO_SQL('NULL::text')}
    FROM square_transactions s
    LEFT JOIN sku_catalog sc
      ON sc.sku = NULLIF(BTRIM(s.line_items->0->>'sku'), '') AND sc.organization_id = s.organization_id
   WHERE s.organization_id = $1 AND s.id = ANY($4::uuid[])`;

export interface InPersonLineRow {
  sub: 'LOCAL_PICKUP' | 'COUNTER' | 'SQUARE';
  record_id: string;
  sku: string | null;
  item_name: string | null;
  catalog_product_title: string | null;
  zoho_item_title: string | null;
  quantity: number | string | null;
  condition: string | null;
  amount: number | string | null;
  currency: string | null;
  image_url: string | null;
}
