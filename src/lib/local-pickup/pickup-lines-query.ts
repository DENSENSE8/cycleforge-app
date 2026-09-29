/** Local Pickup line feed — `GET /api/local-pickup-orders/lines` and the `pickup.orders` nav recents surface read this one query. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { listReceivingUnitStageFacts } from '@/lib/receiving/receiving-unit-stage-facts';
import type { ReceivingUnitStageFactView } from '@/lib/receiving/receiving-line-row';

export interface LocalPickupLineRow {
  id: number;
  order_id: number;
  sku: string | null;
  product_title: string | null;
  image_url: string | null;
  quantity: number | null;
  condition_grade: string | null;
  parts_status: string | null;
  missing_parts_note: string | null;
  condition_note: string | null;
  total_price: string;
  po_number: string | null;
  reference_number: string | null;
  customer_name: string | null;
  order_status: string;
  receiving_id: number | null;
  receiving_line_id?: number | null;
  unit_stage_facts?: ReceivingUnitStageFactView[];
  pickup_date: string | null;
  order_created_at: string;
  payment_method: string | null;
  paid_amount_cents: number | null;
  zoho_po_id: string | null;
  zoho_status: string | null;
  zoho_total: string | null;
  zoho_po_date: string | null;
  zoho_vendor_name: string | null;
}

export interface LocalPickupLinesQuery {
  /** Upper-cased order status, or '' for every non-voided order. */
  status: string;
  /** Free text; a search is not a page (up to 1000 rows). */
  q: string;
  limit: number;
}

/** Newest pickup first, lines in entry order within an order. */
export async function listLocalPickupLines(
  orgId: OrgId,
  query: LocalPickupLinesQuery,
): Promise<LocalPickupLineRow[]> {
  const params: unknown[] = [orgId];
  const clauses = ['i.organization_id = $1', "o.status <> 'VOIDED'"];
  if (query.status) {
    params.push(query.status);
    clauses.push(`o.status = $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    const qIdx = params.length;
    clauses.push(
      `(i.product_title ILIKE $${qIdx}
         OR i.sku ILIKE $${qIdx}
         OR o.zoho_purchaseorder_number ILIKE $${qIdx}
         OR o.zoho_reference_number ILIKE $${qIdx}
         OR o.customer_name ILIKE $${qIdx})`,
    );
  }
  params.push(query.q ? 1000 : query.limit);
  const limitIdx = params.length;

  const rows = await tenantQuery<LocalPickupLineRow>(
    orgId,
    `SELECT
       i.id,
       i.order_id,
       i.sku,
       i.product_title,
       i.image_url,
       i.quantity,
       i.condition_grade,
       i.parts_status,
       i.missing_parts_note,
       i.condition_note,
       COALESCE(i.total_price, 0)::numeric(12,2)::text AS total_price,
       o.zoho_purchaseorder_number AS po_number,
       o.zoho_reference_number     AS reference_number,
       o.customer_name,
       o.status                    AS order_status,
       o.receiving_id,
       i.receiving_line_id,
       o.pickup_date::text         AS pickup_date,
       o.created_at::text          AS order_created_at,
       o.payment_method,
       o.paid_amount_cents,
       o.zoho_po_id,
       m.status                    AS zoho_status,
       m.total::text               AS zoho_total,
       m.po_date::text             AS zoho_po_date,
       m.vendor_name               AS zoho_vendor_name
     FROM local_pickup_order_items i
     JOIN local_pickup_orders o
       ON o.id = i.order_id AND o.organization_id = i.organization_id
     LEFT JOIN zoho_po_mirror m
       ON m.zoho_purchaseorder_id::text = o.zoho_po_id::text
      AND m.organization_id = o.organization_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY o.pickup_date DESC NULLS LAST, o.created_at DESC, i.id ASC
     LIMIT $${limitIdx}`,
    params,
  );
  const lineIds = rows.rows.flatMap((row) => row.receiving_line_id != null ? [Number(row.receiving_line_id)] : []);
  const factsByLine = await listReceivingUnitStageFacts(orgId, lineIds);
  for (const row of rows.rows) {
    row.receiving_line_id = row.receiving_line_id == null ? null : Number(row.receiving_line_id);
    row.unit_stage_facts = row.receiving_line_id == null ? [] : (factsByLine.get(row.receiving_line_id) ?? []);
  }
  return rows.rows;
}
