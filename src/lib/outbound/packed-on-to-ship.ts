/**
 * Packed cartons still on the To ship desk — what a backlog scan-out clears.
 *
 * Membership mirrors `/api/orders?inWarehouse=true` (the To ship desk) narrowed
 * to rows the desk paints as packed (`packed_at ?? pack_activity_at`): labeled
 * + tracked, not carrier-shipped, not AFN, no SHIP_CONFIRM yet, and a COMPLETED
 * packer log or PACK station event on the shipment. One row per shipment.
 * Callers: `scripts/scan-out-packed-orders.ts`, the assistant's `bulk_scan_out`.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { sqlOrderHasShipConfirm } from '@/lib/orders/order-grain-sql';
import { PACK_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';

export interface PackedShipment {
  shipment_id: number;
  tracking: string;
  order_ids: string[];
  order_row_ids: number[];
  account_source: string | null;
  status: string | null;
  packed_at: Date;
}

/**
 * Tenant-scoped (RLS) exactly like the desk's feed. `orderRowIds` narrows to
 * shipments carrying at least one of those order rows (null = the whole desk).
 */
export async function loadPackedOnToShip(
  orgId: OrgId,
  orderRowIds: readonly number[] | null = null,
): Promise<PackedShipment[]> {
  const { rows } = await tenantQuery<PackedShipment>(
    orgId,
    `SELECT o.shipment_id,
            BTRIM(stn.tracking_number_raw)               AS tracking,
            array_agg(o.order_id ORDER BY o.id)          AS order_ids,
            array_agg(o.id ORDER BY o.id)                AS order_row_ids,
            min(o.account_source)                        AS account_source,
            min(o.status)                                AS status,
            max(COALESCE(pl.created_at, pa.created_at))  AS packed_at
       FROM orders o
       JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
       LEFT JOIN LATERAL (
         SELECT pl.created_at FROM packer_logs pl
          WHERE pl.shipment_id = o.shipment_id AND pl.completion_state = 'COMPLETED'
          ORDER BY pl.created_at DESC NULLS LAST, pl.id DESC LIMIT 1) pl ON TRUE
       LEFT JOIN LATERAL (
         SELECT sal.created_at FROM station_activity_logs sal
          WHERE sal.station = 'PACK' AND sal.shipment_id = o.shipment_id
            AND sal.activity_type IN (${sqlInList(PACK_ACTIVITY_TYPES)})
          ORDER BY sal.created_at DESC NULLS LAST, sal.id DESC LIMIT 1) pa ON TRUE
      WHERE o.organization_id = $1
        AND NOT ${SHIPPED_BY_CARRIER_SQL}
        AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
        AND NOT ${sqlOrderHasShipConfirm('o')}
        AND COALESCE(BTRIM(stn.tracking_number_raw), '') <> ''
        AND (pl.created_at IS NOT NULL OR pa.created_at IS NOT NULL)
        AND ($2::int[] IS NULL OR o.shipment_id IN (
              SELECT x.shipment_id FROM orders x
               WHERE x.organization_id = $1 AND x.id = ANY($2::int[])))
      GROUP BY o.shipment_id, stn.tracking_number_raw
      ORDER BY packed_at`,
    [orgId, orderRowIds ? [...orderRowIds] : null],
  );
  return rows;
}
