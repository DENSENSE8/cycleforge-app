/**
 * Zoho is a CONNECTOR of inbound orders, not their identity. After the Zoho
 * sync lands (or refreshes) a purchase order's lines, this acknowledges the
 * order inside CycleForge — on the sync's own transaction:
 *
 *   - the `inbound_order` header (source 'zoho', external id = the Zoho PO id,
 *     human number = its PO number, vendor → the org's supplier master);
 *   - every line of the PO joins that order with a line key (the Zoho line
 *     item id, `#n` on a repeat) and its typed unit cost;
 *   - every line is keyed on the INTERNAL catalog item (sku_catalog_id,
 *     through catalog_external_ids) — the Zoho item id stays a fact on
 *     receiving_line_zoho;
 *   - one ledger event per (PO, Zoho last-modified stamp), so a replayed sync
 *     is recognised.
 *
 * The Zoho-specific facts (line item ids, receives, notes) stay where the sync
 * writes them (receiving_line_zoho); this module never calls Zoho.
 */

import { createHash } from 'node:crypto';
import type { OrgId } from '@/lib/tenancy/constants';
import type { TxClient } from './purchase-links';

export interface ZohoPurchaseOrderIdentity {
  zohoPurchaseOrderId: string;
  poNumber: string | null;
  vendorName?: string | null;
  zohoVendorId?: string | null;
  orderDate?: string | null;
  expectedDate?: string | null;
  currency?: string | null;
  lastModifiedTime?: string | null;
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function acknowledgeZohoPurchaseOrder(
  client: TxClient,
  orgId: OrgId,
  po: ZohoPurchaseOrderIdentity,
): Promise<{ inboundOrderId: number; lines: number } | null> {
  const externalId = po.zohoPurchaseOrderId.trim();
  if (!externalId) return null;

  let supplierId: number | null = null;
  const vendor = po.vendorName?.trim() || null;
  if (vendor) {
    const s = await client.query<{ id: number }>(
      `INSERT INTO suppliers (organization_id, name, supplier_type)
       VALUES ($1, $2, 'distributor')
       ON CONFLICT (organization_id, (lower(btrim(name)))) DO UPDATE SET updated_at = suppliers.updated_at
       RETURNING id`,
      [orgId, vendor],
    );
    supplierId = Number(s.rows[0].id);
    if (po.zohoVendorId?.trim()) {
      await client.query(
        `INSERT INTO supplier_external_ids (organization_id, supplier_id, provider, external_id)
         VALUES ($1, $2, 'zoho', $3)
         ON CONFLICT (organization_id, provider, external_id) DO NOTHING`,
        [orgId, supplierId, po.zohoVendorId.trim()],
      );
    }
  }

  const header = await client.query<{ id: number }>(
    `INSERT INTO inbound_order (
       organization_id, source_type, source_platform, external_order_id, external_order_id_norm,
       order_number, receiving_type, origin, supplier_id, vendor_name, currency, order_date, expected_date,
       source_modified_at
     ) VALUES ($1, 'zoho', 'none', $2, inbound_order_number_norm($2), $3, 'PO', 'sync', $4, $5, $6, $7::date, $8::date,
               NULLIF($9, '')::timestamptz)
     ON CONFLICT (organization_id, source_type, source_platform, external_order_id_norm) DO UPDATE SET
       order_number = COALESCE(EXCLUDED.order_number, inbound_order.order_number),
       supplier_id = COALESCE(EXCLUDED.supplier_id, inbound_order.supplier_id),
       vendor_name = COALESCE(EXCLUDED.vendor_name, inbound_order.vendor_name),
       order_date = COALESCE(EXCLUDED.order_date, inbound_order.order_date),
       expected_date = COALESCE(EXCLUDED.expected_date, inbound_order.expected_date),
       source_modified_at = COALESCE(EXCLUDED.source_modified_at, inbound_order.source_modified_at),
       updated_at = now()
     RETURNING id`,
    [
      orgId,
      externalId,
      po.poNumber?.trim() || null,
      supplierId,
      vendor,
      (po.currency?.trim() || 'USD').toUpperCase().slice(0, 3),
      po.orderDate && CIVIL_DATE.test(po.orderDate) ? po.orderDate : null,
      po.expectedDate && CIVIL_DATE.test(po.expectedDate) ? po.expectedDate : null,
      po.lastModifiedTime ?? '',
    ],
  );
  const inboundOrderId = Number(header.rows[0].id);

  // Lines of this PO join the order; keys are the Zoho line ids (#n on a repeat,
  // L<n> when Zoho gave none). Keys already assigned are kept.
  const attached = await client.query<{ id: number }>(
    `WITH po_lines AS (
       SELECT rl.id,
              COALESCE(NULLIF(btrim(rz.zoho_line_item_id), ''), 'L' || row_number() OVER (ORDER BY rl.id)) AS base_key,
              rz.zoho_item_id,
              rz.unit_price
         FROM receiving_line rl
         JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
        WHERE rl.organization_id = $1
          AND rz.zoho_purchaseorder_id = $2
     ),
     keyed AS (
       SELECT id, zoho_item_id, unit_price,
              base_key || CASE WHEN row_number() OVER (PARTITION BY base_key ORDER BY id) = 1 THEN ''
                               ELSE '#' || row_number() OVER (PARTITION BY base_key ORDER BY id) END AS line_key
         FROM po_lines
     )
     UPDATE receiving_line rl
        SET inbound_order_id = $3,
            line_key = COALESCE(CASE WHEN rl.inbound_order_id = $3 THEN rl.line_key END, k.line_key),
            unit_cost_cents = COALESCE(rl.unit_cost_cents, CASE WHEN k.unit_price >= 0 THEN round(k.unit_price * 100)::bigint END),
            currency = COALESCE(rl.currency, $4),
            sku_catalog_id = COALESCE(rl.sku_catalog_id, (
              SELECT x.sku_catalog_id FROM catalog_external_ids x
               WHERE x.organization_id = rl.organization_id AND x.provider = 'zoho' AND x.external_id = k.zoho_item_id
               LIMIT 1))
       FROM keyed k
      WHERE rl.id = k.id
        AND (rl.inbound_order_id IS NULL OR rl.inbound_order_id = $3)
     RETURNING rl.id`,
    [orgId, externalId, inboundOrderId, (po.currency?.trim() || 'USD').toUpperCase().slice(0, 3)],
  );

  const eventId = `zoho:${externalId}:${po.lastModifiedTime ?? 'unstamped'}`;
  const payload = { ...po, lines: attached.rows.length };
  await client.query(
    `INSERT INTO inbound_ingest_event (
       organization_id, origin, source, source_event_id, payload, payload_hash, status, outcome,
       attempts, inbound_order_id, landed_at
     ) VALUES ($1, 'sync', 'zoho', $2, $3::jsonb, $4, 'landed', $5::jsonb, 1, $6, now())
     ON CONFLICT (organization_id, source, source_event_id) DO UPDATE SET
       status = 'unchanged', attempts = inbound_ingest_event.attempts + 1, updated_at = now()`,
    [
      orgId,
      eventId,
      JSON.stringify(payload),
      createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      JSON.stringify({ lines: attached.rows.length }),
      inboundOrderId,
    ],
  );

  return { inboundOrderId, lines: attached.rows.length };
}
