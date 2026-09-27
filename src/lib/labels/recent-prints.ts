/** Recently printed labels — `GET /api/labels/recent` and the `labels.prints` nav recents surface read this one query. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface RecentLabelPrintRow {
  id: number;
  printed_at: string;
  staff_id: number | null;
  staff_name: string | null;
  sku: string | null;
  sku_catalog_id: number | null;
  product_title: string | null;
  image_url: string | null;
  unit_id: string | null;
  gtin: string | null;
  symbology: string | null;
  serial_count: number | null;
  print_class: string | null;
  serial_unit_id: number | null;
  serial_number: string | null;
  current_status: string | null;
  current_location: string | null;
}

/** Newest-first LABEL_PRINTED activity; `staffId: null` = every printer in the org. */
export async function listRecentLabelPrints(
  orgId: OrgId,
  opts: { limit: number; staffId: number | null },
): Promise<RecentLabelPrintRow[]> {
  // Tenant ownership filter — $2 is the org id; referenced by the primary
  // WHERE and by every joined tenant table so a shared integer surrogate id
  // can never pull in another org's row.
  const params: unknown[] = [opts.limit, orgId];
  let staffClause = '';
  if (opts.staffId != null && Number.isFinite(opts.staffId)) {
    params.push(opts.staffId);
    staffClause = `AND sal.staff_id = $${params.length}`;
  }

  const result = await tenantQuery<RecentLabelPrintRow>(
    orgId,
    `
    SELECT
      sal.id,
      sal.created_at::text                     AS printed_at,
      sal.staff_id,
      st.name                                  AS staff_name,
      (sal.metadata->>'sku')                   AS sku,
      NULLIF(sal.metadata->>'sku_catalog_id','')::int AS sku_catalog_id,
      sc.product_title,
      sc.image_url,
      (sal.metadata->>'unit_id')               AS unit_id,
      (sal.metadata->>'gtin')                  AS gtin,
      (sal.metadata->>'symbology')             AS symbology,
      NULLIF(sal.metadata->>'serial_count','')::int AS serial_count,
      (sal.metadata->>'print_class')           AS print_class,
      tsn.serial_unit_id,
      tsn.serial_number,
      su.current_status::text                  AS current_status,
      su.current_location                      AS current_location
    FROM station_activity_logs sal
    LEFT JOIN sku_catalog sc
      ON sc.id = NULLIF(sal.metadata->>'sku_catalog_id','')::int
      AND sc.organization_id = sal.organization_id
    LEFT JOIN LATERAL (
      SELECT serial_unit_id, serial_number
      FROM tech_serial_numbers
      WHERE context_station_activity_log_id = sal.id
        AND organization_id = sal.organization_id
      ORDER BY id ASC
      LIMIT 1
    ) tsn ON true
    LEFT JOIN serial_units su ON su.id = tsn.serial_unit_id
      AND su.organization_id = sal.organization_id
    LEFT JOIN staff st ON st.id = sal.staff_id
      AND st.organization_id = sal.organization_id
    WHERE sal.activity_type = 'LABEL_PRINTED'
      AND sal.organization_id = $2
      ${staffClause}
    ORDER BY sal.created_at DESC, sal.id DESC
    LIMIT $1
    `,
    params,
  );
  return result.rows;
}
