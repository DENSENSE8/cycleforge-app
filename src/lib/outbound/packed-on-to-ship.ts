/**
 * Packed identifications still on the To ship desk — what a backlog scan-out
 * clears.
 *
 * The completed ORDERS packer log is the packing source of truth. Starting from
 * that log keeps unfound/unmatched labels in the backlog even when no `orders`
 * row owns their shipment. Membership remains: tracked, not carrier-shipped,
 * not AFN, no SHIP_CONFIRM yet. One row per shipment.
 * Callers: `scripts/scan-out-packed-orders.ts`, the assistant's `bulk_scan_out`.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { sqlOrderHasShipConfirm } from '@/lib/orders/order-grain-sql';

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
 * shipments carrying at least one of those order rows (null = every packed
 * identification, including unmatched/unfound labels).
 */
export async function loadPackedOnToShip(
  orgId: OrgId,
  orderRowIds: readonly number[] | null = null,
): Promise<PackedShipment[]> {
  const { rows } = await tenantQuery<PackedShipment>(
    orgId,
    `WITH latest_pack AS (
       SELECT DISTINCT ON (pl.shipment_id)
              pl.organization_id,
              pl.shipment_id,
              pl.scan_ref,
              pl.created_at AS packed_at
         FROM packer_logs pl
        WHERE pl.organization_id = $1
          AND pl.tracking_type = 'ORDERS'
          AND pl.completion_state = 'COMPLETED'
          AND pl.shipment_id IS NOT NULL
        ORDER BY pl.shipment_id, pl.created_at DESC NULLS LAST, pl.id DESC
     )
     SELECT lp.shipment_id,
            BTRIM(COALESCE(stn.tracking_number_raw, lp.scan_ref)) AS tracking,
            COALESCE(
              array_agg(o.order_id ORDER BY o.id) FILTER (WHERE o.id IS NOT NULL),
              ARRAY[]::text[]
            ) AS order_ids,
            COALESCE(
              array_agg(o.id ORDER BY o.id) FILTER (WHERE o.id IS NOT NULL),
              ARRAY[]::int[]
            ) AS order_row_ids,
            min(o.account_source) AS account_source,
            min(o.status) AS status,
            lp.packed_at
       FROM latest_pack lp
       LEFT JOIN shipping_tracking_numbers stn
         ON stn.id = lp.shipment_id
       LEFT JOIN orders o
         ON o.shipment_id = lp.shipment_id
        AND o.organization_id = lp.organization_id
      WHERE NOT ${SHIPPED_BY_CARRIER_SQL}
        AND NOT ${sqlOrderHasShipConfirm('lp')}
        AND COALESCE(BTRIM(COALESCE(stn.tracking_number_raw, lp.scan_ref)), '') <> ''
        AND NOT EXISTS (
              SELECT 1
                FROM orders afn
               WHERE afn.organization_id = lp.organization_id
                 AND afn.shipment_id = lp.shipment_id
                 AND COALESCE(afn.fulfillment_channel, '') = 'AFN')
        AND ($2::int[] IS NULL OR EXISTS (
              SELECT 1
                FROM orders x
               WHERE x.organization_id = lp.organization_id
                 AND x.shipment_id = lp.shipment_id
                 AND x.id = ANY($2::int[])))
      GROUP BY lp.shipment_id, stn.tracking_number_raw, lp.scan_ref, lp.packed_at
      ORDER BY lp.packed_at`,
    [orgId, orderRowIds ? [...orderRowIds] : null],
  );
  return rows;
}
