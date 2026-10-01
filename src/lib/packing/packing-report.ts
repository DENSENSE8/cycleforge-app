import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { toCsv } from '@/lib/warranty/reports';
import { DEFAULT_TIER_MINUTES } from '@/lib/packing/pack-tier-classifier';
import {
  mapPackingReportDbRow,
  PACKING_REPORT_COLUMNS,
  type PackingReportRow,
} from '@/lib/packing/packing-report-shared';

export type { PackingReportRow } from '@/lib/packing/packing-report-shared';
export { PACKING_REPORT_COLUMNS } from '@/lib/packing/packing-report-shared';

export function packingRowsToCsv(rows: PackingReportRow[]): string {
  return toCsv(rows, PACKING_REPORT_COLUMNS);
}

export async function buildPackingReportRows(
  filters: { day: string; packerId?: number | null },
  orgId: OrgId,
): Promise<PackingReportRow[]> {
  const params: unknown[] = [orgId, filters.day];
  let packerPredicate = '';
  if (filters.packerId && Number.isFinite(filters.packerId)) {
    params.push(filters.packerId);
    packerPredicate = ` AND sal.staff_id = $${params.length}`;
  }

  /* `order_number` was added 2026-09-16. */
  const sql = `
    WITH pack_events AS (
      SELECT
        sal.*,
        LEAD(sal.created_at) OVER (
          PARTITION BY sal.staff_id
          ORDER BY sal.created_at, sal.id
        ) AS next_pack_at,
        LAG(sal.created_at) OVER (
          PARTITION BY sal.staff_id
          ORDER BY sal.created_at, sal.id
        ) AS previous_pack_at
      FROM station_activity_logs sal
      WHERE sal.station = 'PACK'
        AND sal.activity_type = 'PACK_COMPLETED'
        AND sal.organization_id = $1
        AND (timezone('America/Los_Angeles', sal.created_at))::date = $2::date
        ${packerPredicate}
    )
    SELECT
      sal.id AS sal_id,
      sal.created_at::text AS packed_at,
      CASE
        WHEN pl.created_at IS NOT NULL AND pl.updated_at IS NOT NULL AND EXISTS (
          SELECT 1
          FROM ops_events capture_event
          WHERE capture_event.organization_id = sal.organization_id
            AND capture_event.entity_type = 'other'
            AND capture_event.entity_id = pl.id
            AND capture_event.event_type = 'pack_capture_started'
        ) THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (pl.updated_at - pl.created_at))))::int
        WHEN sal.previous_pack_at IS NOT NULL
          THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (sal.created_at - sal.previous_pack_at))))::int
        ELSE NULL
      END AS pack_duration_seconds,
      CASE
        WHEN sal.next_pack_at IS NULL THEN NULL
        ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (sal.next_pack_at - sal.created_at))))::int
      END AS next_pack_seconds,
      s.name AS packer_name,
      COALESCE(enr.resolved_sku, o.sku) AS sku,
      COALESCE(o.product_title, enr.external_product_title) AS product_title,
      enr.pack_tier AS raw_pack_tier,
      COALESCE(enr.pack_tier, 'SMALL') AS pack_tier,
      COALESCE(
        enr.estimated_pack_minutes,
        CASE COALESCE(enr.pack_tier, 'SMALL')
          WHEN 'SMALL' THEN ${DEFAULT_TIER_MINUTES.SMALL}
          WHEN 'LARGE' THEN ${DEFAULT_TIER_MINUTES.LARGE}
          ELSE ${DEFAULT_TIER_MINUTES.MEDIUM}
        END
      )::int AS estimated_minutes,
      pl.tracking_type AS tracking_type,
      COALESCE(stn.tracking_number_raw, sal.scan_ref) AS tracking_or_scan_ref,
      -- The order number: operator-facing handle, distinct from the carrier
      -- tracking above it. NULL on an unpaired scan. See the note on the sql
      -- const below.
      NULLIF(TRIM(o.order_id), '') AS order_number,
      -- The facts the SHARED compound cells need to paint the way every other
      -- data table paints. See the note on the sql const.
      sal.staff_id AS packer_staff_id,
      o.account_source AS platform,
      CASE
        WHEN TRIM(COALESCE(o.quantity, '')) ~ '^[0-9]+([.][0-9]+)?$'
          THEN o.quantity::numeric
        ELSE 1
      END::float8 AS quantity,
      COALESCE(NULLIF(TRIM(sc.image_url), ''), listing_image.image_url) AS image_url,
      NULLIF(TRIM(o.item_number), '') AS item_number,
      COALESCE(enr.sku_catalog_id, o.sku_catalog_id) AS sku_catalog_id,
      enr.tier_source AS tier_source,
      sal.packer_log_id AS packer_log_id
    FROM pack_events sal
    LEFT JOIN packer_log_enrichment enr ON enr.sal_id = sal.id
    LEFT JOIN packer_logs pl ON pl.id = sal.packer_log_id
    LEFT JOIN orders o ON o.id = enr.order_row_id AND o.organization_id = sal.organization_id
    LEFT JOIN sku_catalog sc
      ON sc.id = COALESCE(enr.sku_catalog_id, o.sku_catalog_id)
     AND sc.organization_id = sal.organization_id
    LEFT JOIN LATERAL (
      SELECT NULLIF(TRIM(spi.image_url), '') AS image_url
      FROM sku_platform_ids spi
      WHERE spi.sku_catalog_id = sc.id
        AND spi.organization_id = sal.organization_id
        AND spi.is_active = TRUE
        AND NULLIF(TRIM(spi.image_url), '') IS NOT NULL
      ORDER BY spi.id
      LIMIT 1
    ) listing_image ON TRUE
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = COALESCE(pl.shipment_id, sal.shipment_id)
    LEFT JOIN staff s ON s.id = sal.staff_id
    ORDER BY sal.created_at DESC
    LIMIT 10000
  `;

  const result = await tenantQuery<{
    sal_id: number;
    packed_at: string;
    pack_duration_seconds: number | null;
    next_pack_seconds: number | null;
    packer_name: string | null;
    sku: string | null;
    product_title: string | null;
    raw_pack_tier: string | null;
    pack_tier: string;
    estimated_minutes: number;
    tracking_type: string | null;
    tracking_or_scan_ref: string | null;
    order_number: string | null;
    packer_staff_id: number | null;
    platform: string | null;
    quantity: number;
    image_url: string | null;
    item_number: string | null;
    sku_catalog_id: number | null;
    tier_source: string | null;
    packer_log_id: number | null;
  }>(orgId, sql, params);

  return result.rows.map(mapPackingReportDbRow);
}
