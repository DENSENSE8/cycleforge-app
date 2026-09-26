/** The SQL reads behind the ASN projection. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { AsnCartonRow, AsnLineRow, AsnShipmentRow } from './asn-projection';

/** The shipment row. */
export async function fetchAsnShipment(args: {
  orgId: string;
  shipmentId: number;
}): Promise<AsnShipmentRow | null> {
  const res = await tenantQuery<AsnShipmentRow>(
    args.orgId as OrgId,
    `SELECT
       stn.id,
       stn.tracking_number_raw,
       stn.carrier,
       stn.latest_status_category,
       stn.delivered_at,
       stn.label_created_at
     FROM shipping_tracking_numbers stn
     WHERE stn.id = $2
       AND EXISTS (
         SELECT 1 FROM receiving_carton rc
         WHERE rc.shipment_id = stn.id AND rc.organization_id = $1
       )
     LIMIT 1`,
    [args.orgId, args.shipmentId],
  );
  return res.rows[0] ?? null;
}

export async function fetchAsnCartons(args: {
  orgId: string;
  shipmentId: number;
}): Promise<AsnCartonRow[]> {
  const res = await tenantQuery<AsnCartonRow>(
    args.orgId as OrgId,
    `SELECT
       rc.id,
       rc.zoho_purchaseorder_number,
       rc.carrier,
       rc.receiving_date_time
     FROM receiving_carton rc
     WHERE rc.organization_id = $1 AND rc.shipment_id = $2
     ORDER BY rc.id ASC`,
    [args.orgId, args.shipmentId],
  );
  return res.rows;
}

/** Lines for a set of cartons. */
export async function fetchAsnLines(args: {
  orgId: string;
  cartonIds: number[];
}): Promise<AsnLineRow[]> {
  if (args.cartonIds.length === 0) return [];
  const res = await tenantQuery<AsnLineRow>(
    args.orgId as OrgId,
    `SELECT
       rl.id,
       rl.receiving_id,
       rl.sku,
       rl.item_name,
       rl.quantity,
       rl.quantity_expected,
       rl.quantity_received,
       rl.workflow_status,
       sc.gtin
     FROM receiving_line rl
     LEFT JOIN sku_catalog sc ON sc.id = rl.sku_catalog_id
     WHERE rl.organization_id = $1 AND rl.receiving_id = ANY($2::int[])
     ORDER BY rl.receiving_id ASC, rl.id ASC`,
    [args.orgId, args.cartonIds],
  );
  return res.rows;
}
