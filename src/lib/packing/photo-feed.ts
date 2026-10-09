/**
 * The phone Packing photo feed (`/m/packing`, owner 2026-10-08) — the packing
 * mirror of the Unbox photo feed. One row per pack (`packer_logs`) this staff
 * member made, newest first: a desk tracking scan at the pack station creates
 * the row (`POST /api/packing-logs`) and publishes `scan_ready` on the staff's
 * packer channel, which is what refetches the feed.
 */

import type { Queryable } from '@/lib/neon/serial-units-queries';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';

/** Rows the feed paints — the same window as the Unbox feed's "Latest 25". */
export const PACKING_FEED_LIMIT = 25;

export interface PackingFeedRow {
  packerLogId: number;
  /** `orders.id` — null for a scan that matched no order. */
  orderRowId: number | null;
  /** The channel order number (`orders.order_id`). */
  orderId: string | null;
  tracking: string | null;
  /** The shipment's carrier — paints the tracking chip's carrier ink. */
  carrier: string | null;
  title: string;
  sku: string | null;
  photoCount: number;
  packedAt: string;
}

interface DbRow {
  packer_log_id: number;
  order_row_id: number | null;
  order_id: string | null;
  tracking: string | null;
  carrier: string | null;
  catalog_product_title: string | null;
  order_product_title: string | null;
  sku: string | null;
  photo_count: number;
  packed_at: string;
}

export async function loadPackingPhotoFeed(
  client: Queryable,
  orgId: OrgId,
  staffId: number,
  limit: number = PACKING_FEED_LIMIT,
): Promise<PackingFeedRow[]> {
  const result = await client.query<DbRow>(
    `SELECT pl.id AS packer_log_id,
            o.id AS order_row_id,
            o.order_id,
            COALESCE(NULLIF(BTRIM(stn.tracking_number_raw), ''), NULLIF(BTRIM(pl.scan_ref), '')) AS tracking,
            stn.carrier,
            sc.product_title AS catalog_product_title,
            o.product_title AS order_product_title,
            COALESCE(NULLIF(BTRIM(o.sku), ''), sc.sku) AS sku,
            (SELECT COUNT(DISTINCT pel.photo_id)::int
               FROM photo_entity_links pel
              WHERE pel.organization_id = pl.organization_id
                AND pel.entity_type = 'PACKER_LOG'
                AND pel.entity_id = pl.id) AS photo_count,
            to_char(pl.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS packed_at
       FROM packer_logs pl
       LEFT JOIN shipping_tracking_numbers stn
         ON stn.id = pl.shipment_id AND stn.organization_id = pl.organization_id
       LEFT JOIN LATERAL (
         SELECT o1.* FROM orders o1
          WHERE o1.organization_id = pl.organization_id
            AND pl.shipment_id IS NOT NULL
            AND o1.shipment_id = pl.shipment_id
          ORDER BY o1.id
          LIMIT 1
       ) o ON TRUE
       LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('o')}
      WHERE pl.organization_id = $1
        AND pl.packed_by = $2
      ORDER BY pl.created_at DESC, pl.id DESC
      LIMIT $3`,
    [orgId, staffId, limit],
  );
  return result.rows.map((row) => ({
    packerLogId: Number(row.packer_log_id),
    orderRowId: row.order_row_id != null ? Number(row.order_row_id) : null,
    orderId: row.order_id,
    tracking: row.tracking,
    carrier: row.carrier,
    title: resolveSkuIdentityTitle({
      catalog_product_title: row.catalog_product_title,
      item_name: row.order_product_title,
      sku: row.sku,
    }) || (row.order_id ? `Order ${row.order_id}` : 'Unmatched scan'),
    sku: row.sku,
    photoCount: Number(row.photo_count) || 0,
    packedAt: row.packed_at,
  }));
}
