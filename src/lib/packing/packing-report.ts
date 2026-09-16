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

  /*
   * `order_number` was added 2026-09-16. The desk Id chip paints the order
   * number on its first line and the tracking's last-8 on its second, and with
   * no order number on the row it painted the TRACKING twice — operator:
   * *"the tracking number is already in the second row … the first row should
   * be the order number only, and if the order number is not present it should
   * be empty."* `o.order_id` is NULL whenever the pack scan never resolved to
   * an order row, which is exactly the "empty" case.
   *
   * `packer_staff_id` and `platform` were added for the same reason, and it is
   * the more important one: a slot-table family MUST feed the shared compound
   * cells the facts they paint, or it silently forks. Without the staff id the
   * `person` face cannot resolve `staff.color_hex` and every packer drew the
   * same default bubble; without `account_source` the Id chip cannot resolve
   * its marketplace mark and the order number lost its platform dot. Operator
   * 2026-09-16: *"it should not be a fork of the slot data table."* The FIX
   * was never in the view layer — the projection was short two columns.
   */
  const sql = `
    SELECT
      sal.id AS sal_id,
      sal.created_at::text AS packed_at,
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
      -- slot table paints. See the note on the sql const.
      sal.staff_id AS packer_staff_id,
      o.account_source AS platform,
      NULLIF(TRIM(o.item_number), '') AS item_number,
      COALESCE(enr.sku_catalog_id, o.sku_catalog_id) AS sku_catalog_id,
      enr.tier_source AS tier_source,
      sal.packer_log_id AS packer_log_id
    FROM station_activity_logs sal
    LEFT JOIN packer_log_enrichment enr ON enr.sal_id = sal.id
    LEFT JOIN packer_logs pl ON pl.id = sal.packer_log_id
    LEFT JOIN orders o ON o.id = enr.order_row_id AND o.organization_id = sal.organization_id
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = COALESCE(pl.shipment_id, sal.shipment_id)
    LEFT JOIN staff s ON s.id = sal.staff_id
    WHERE sal.station = 'PACK'
      AND sal.activity_type = 'PACK_COMPLETED'
      AND sal.organization_id = $1
      AND (timezone('America/Los_Angeles', sal.created_at))::date = $2::date
      ${packerPredicate}
    ORDER BY sal.created_at DESC
    LIMIT 10000
  `;

  const result = await tenantQuery<{
    sal_id: number;
    packed_at: string;
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
    item_number: string | null;
    sku_catalog_id: number | null;
    tier_source: string | null;
    packer_log_id: number | null;
  }>(orgId, sql, params);

  return result.rows.map(mapPackingReportDbRow);
}
