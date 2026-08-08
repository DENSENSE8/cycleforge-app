import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { isPrimaryTechStaff } from '@/lib/neon/staff-stations-queries';

export type TechQueueItem = {
  kind: 'return_pending_test' | 'order_ready_ship';
  receivingId: number;
  lineId: number | null;
  trackingNumber: string | null;
  orderNumber: string | null;
  /** Raw platform key for OrderIdChip (`source_platform` / pill / inbound). */
  sourcePlatform: string | null;
  productTitle: string | null;
  unboxedAt: string | null;
};

const REP_LINE_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT rl.id AS line_id,
           rl.source_order_id,
           rl.source_platform_pill,
           rl.inbound_source_type,
           rz.zoho_purchaseorder_number AS line_po,
           COALESCE(zi.name, rl.item_name, rl.sku) AS product_title
      FROM receiving_line rl
      LEFT JOIN receiving_line_zoho rz
        ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
      LEFT JOIN items zi
        ON zi.zoho_item_id = rz.zoho_item_id AND zi.status = 'active'
       AND zi.organization_id = rl.organization_id
     WHERE rl.receiving_id = r.id AND rl.organization_id = $1
     ORDER BY rl.id ASC
     LIMIT 1
  ) rep ON true`;

/** Same ladder as receiving rail peeks: pill → carton platform → inbound type. */
const SOURCE_PLATFORM_SQL = `NULLIF(TRIM(COALESCE(
  NULLIF(rep.source_platform_pill, ''),
  NULLIF(r.source_platform, ''),
  NULLIF(rep.inbound_source_type, '')
)), '')`;


/** Tech-station backlog for primary tech staff; empty for everyone else. */
export async function listTechQueueItemsForStaff(
  organizationId: OrgId,
  staffId: number,
): Promise<TechQueueItem[]> {
  const isTech = await isPrimaryTechStaff(staffId, organizationId);
  if (!isTech) return [];

  const returnsRes = await tenantQuery<{
    receiving_id: number;
    line_id: number | null;
    tracking: string | null;
    order_number: string | null;
    source_platform: string | null;
    product_title: string | null;
    unboxed_at: string | null;
  }>(
    organizationId,
    `SELECT r.id AS receiving_id,
            rep.line_id,
            stn.tracking_number_raw AS tracking,
            rep.source_order_id AS order_number,
            ${SOURCE_PLATFORM_SQL} AS source_platform,
            rep.product_title,
            ru.unboxed_at::text AS unboxed_at
       FROM receiving_carton r
       LEFT JOIN receiving_unbox ru
         ON ru.receiving_id = r.id
        AND ru.organization_id = r.organization_id
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
       ${REP_LINE_LATERAL}
      WHERE COALESCE(r.is_return, false) = true
        AND ru.unboxed_at IS NOT NULL
        AND r.organization_id = $1
        AND EXISTS (
          SELECT 1 FROM receiving_line rl
           LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
           WHERE rl.receiving_id = r.id
             AND rl.organization_id = $1
             AND COALESCE(rlt.needs_test, true) = true
             AND COALESCE(rl.workflow_status::text, '') NOT IN ('DONE','PASSED','FAILED','RTV','SCRAP')
        )
      ORDER BY ru.unboxed_at DESC
      LIMIT 50`,
    [organizationId],
  );

  const ordersRes = await tenantQuery<{
    receiving_id: number;
    line_id: number | null;
    tracking: string | null;
    order_number: string | null;
    source_platform: string | null;
    product_title: string | null;
    unboxed_at: string | null;
  }>(
    organizationId,
    `SELECT r.id AS receiving_id,
            rep.line_id,
            stn.tracking_number_raw AS tracking,
            COALESCE(rep.source_order_id, rep.line_po, r.zoho_purchaseorder_number) AS order_number,
            ${SOURCE_PLATFORM_SQL} AS source_platform,
            rep.product_title,
            ru.unboxed_at::text AS unboxed_at
       FROM receiving_carton r
       LEFT JOIN receiving_unbox ru
         ON ru.receiving_id = r.id
        AND ru.organization_id = r.organization_id
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
       ${REP_LINE_LATERAL}
      WHERE COALESCE(r.is_priority, false) = true
        AND COALESCE(r.is_return, false) = false
        AND ru.unboxed_at IS NOT NULL
        AND ru.unboxed_at > NOW() - interval '3 days'
        AND r.organization_id = $1
      ORDER BY ru.unboxed_at DESC
      LIMIT 50`,
    [organizationId],
  );

  return [
    ...returnsRes.rows.map((row) => ({
      kind: 'return_pending_test' as const,
      receivingId: Number(row.receiving_id),
      lineId: row.line_id != null ? Number(row.line_id) : null,
      trackingNumber: row.tracking ?? null,
      orderNumber: row.order_number ?? null,
      sourcePlatform: row.source_platform ?? null,
      productTitle: row.product_title ?? null,
      unboxedAt: row.unboxed_at ?? null,
    })),
    ...ordersRes.rows.map((row) => ({
      kind: 'order_ready_ship' as const,
      receivingId: Number(row.receiving_id),
      lineId: row.line_id != null ? Number(row.line_id) : null,
      trackingNumber: row.tracking ?? null,
      orderNumber: row.order_number ?? null,
      sourcePlatform: row.source_platform ?? null,
      productTitle: row.product_title ?? null,
      unboxedAt: row.unboxed_at ?? null,
    })),
  ];
}