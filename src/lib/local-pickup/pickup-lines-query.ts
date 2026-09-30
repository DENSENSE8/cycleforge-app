/** Local Pickup line feed — `GET /api/local-pickup-orders/lines` and the `pickup.orders` nav recents surface read this one query. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { listReceivingUnitStageFacts } from '@/lib/receiving/receiving-unit-stage-facts';
import type { ReceivingUnitStageFactView } from '@/lib/receiving/receiving-line-row';
import { listingCoverThumbUrlSql } from '@/lib/photos/listing-photos';
import { SKU_CATALOG_JOIN_ON_SQL } from '@/lib/sku/sku-identity-law';

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
  /** Who keyed the pickup — the collector on record. */
  created_by_name: string | null;
  /** The linked receiving line's own SKU — what label issuance prints. */
  line_sku: string | null;
  /** `sku_catalog.id` for the line's SKU — where a product photo lands. */
  sku_catalog_id: number | null;
  quantity_received: number | null;
  unboxed_at: string | null;
  /** The floor's line grade (`receiving_line_testing`) and its grading act. */
  line_condition_grade: string | null;
  line_graded_at: string | null;
  line_graded_by_name: string | null;
  /** The line's assigned QC tester. */
  assigned_tech_id: number | null;
  /** Physical units on the line whose serial is shelved (STOCKED) or past it. */
  put_away_units: number;
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
       -- Our catalog first (owner 2026-09-29), then the photo keyed on the pickup.
       COALESCE(NULLIF(BTRIM(sc.image_url), ''), ${listingCoverThumbUrlSql('sc')}, NULLIF(i.image_url, '')) AS image_url,
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
       m.vendor_name               AS zoho_vendor_name,
       creator.name                AS created_by_name,
       NULLIF(BTRIM(rl.sku), '')   AS line_sku,
       sc.id                       AS sku_catalog_id,
       rl.quantity_received,
       rl.unboxed_at::text         AS unboxed_at,
       rlt.condition_grade::text   AS line_condition_grade,
       rlt.condition_graded_at::text AS line_graded_at,
       grader.name                 AS line_graded_by_name,
       rlt.assigned_tech_id,
       COALESCE(shelved.units, 0)::int AS put_away_units
     FROM local_pickup_order_items i
     JOIN local_pickup_orders o
       ON o.id = i.order_id AND o.organization_id = i.organization_id
     LEFT JOIN zoho_po_mirror m
       ON m.zoho_purchaseorder_id::text = o.zoho_po_id::text
      AND m.organization_id = o.organization_id
     LEFT JOIN staff creator
       ON creator.id = o.created_by AND creator.organization_id = o.organization_id
     LEFT JOIN receiving_line rl
       ON rl.id = i.receiving_line_id AND rl.organization_id = i.organization_id
     LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
     LEFT JOIN receiving_line_testing rlt
       ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
     LEFT JOIN staff grader
       ON grader.id = rlt.condition_graded_by AND grader.organization_id = rlt.organization_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS units
         FROM receiving_line_unit rlu
         JOIN serial_units su
           ON su.id = rlu.serial_unit_id AND su.organization_id = rlu.organization_id
        WHERE rlu.receiving_line_id = rl.id
          AND rlu.organization_id = rl.organization_id
          AND su.current_status::text IN ('STOCKED', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKING', 'PACKED', 'SHIPPED')
     ) shelved ON TRUE
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
