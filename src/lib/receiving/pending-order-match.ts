/** Pending-order SKU match for receiving-door scans. */

import pool from '@/lib/db';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';

/** Return the subset of pending-order SKUs that intersect the scanned carton. */
export async function findPendingOrderSkuMatches(
  organizationId: string,
  skus: ReadonlyArray<string | null | undefined>,
  zohoItemIds: ReadonlyArray<string | null | undefined> = [],
): Promise<string[]> {
  const cleanSkus = Array.from(
    new Set(skus.map((s) => (s ?? '').trim()).filter((s) => s.length > 0)),
  );
  const cleanZohoIds = Array.from(
    new Set(zohoItemIds.map((s) => (s ?? '').trim()).filter((s) => s.length > 0)),
  );

  // Nothing identifiable on the carton — no work to do.
  if (cleanSkus.length === 0 && cleanZohoIds.length === 0) return [];

  const sql = `
    WITH pending AS (
      SELECT DISTINCT
        COALESCE(sc.sku, o.sku) AS sku,
        o.sku_catalog_id
      FROM orders o
      LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.organization_id = $1
        AND NOT ${SHIPPED_BY_CARRIER_SQL}
        AND NOT EXISTS (
          SELECT 1 FROM station_activity_logs sal
          WHERE sal.shipment_id IS NOT NULL AND sal.shipment_id = o.shipment_id
        )
    ),
    target_catalog AS (
      SELECT DISTINCT sku_catalog_id
      FROM sku_platform_ids
      WHERE sku_catalog_id IS NOT NULL
        AND platform_item_id = ANY($3::text[])
    )
    SELECT DISTINCT p.sku
    FROM pending p
    WHERE p.sku IS NOT NULL
      AND (
        p.sku = ANY($2::text[])
        OR (
          p.sku_catalog_id IS NOT NULL
          AND p.sku_catalog_id IN (SELECT sku_catalog_id FROM target_catalog)
        )
      )
  `;

  const result = await pool.query(sql, [organizationId, cleanSkus, cleanZohoIds]);
  return result.rows.map((r: { sku: string }) => r.sku).filter(Boolean);
}
