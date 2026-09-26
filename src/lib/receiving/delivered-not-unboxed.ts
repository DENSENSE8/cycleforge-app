/** "Delivered · not unboxed" — carrier delivered, warehouse has not finished unboxing. */

import type { OrgId } from '@/lib/tenancy/constants';
import {
  NOT_ZOHO_RECEIVED_PREDICATE,
  SHIPMENT_SCANNED_PREDICATE,
  deliveredUnscannedAgeBandSql,
  type DeliveredUnscannedAgeBand,
} from '@/lib/receiving/delivered-unscanned';
import { NO_OPEN_LOSS_EXCEPTION_PREDICATE } from '@/lib/receiving/exception-codes';

/** Feed window — deliberately WIDER than {@link EBAY_CLAIM_WINDOW_DAYS}. */
export const DELIVERED_NOT_UNBOXED_WINDOW_DAYS = 45;
export const DELIVERED_NOT_UNBOXED_CAP = 100;

/** eBay Money Back Guarantee: */
export const EBAY_CLAIM_WINDOW_DAYS = 30;

/** SQL for the eBay claim deadline (aliases `rl`, `mirror`, `stn`) — NULL on any non-eBay line. */
export function ebayClaimByDateSql(daysParam: string): string {
  return `CASE WHEN rl.inbound_source_type = 'ebay' THEN (
             COALESCE(
               mirror.expected_delivery_date,
               timezone('America/Los_Angeles', stn.delivered_at)::date
             ) + (${daysParam} || ' days')::interval
           )::date::text ELSE NULL END`;
}

/** Shared not-unboxed guard (aliases `rl`, `r`). */
export const NOT_UNBOXED_PREDICATE = `COALESCE(rl.quantity_received, 0) = 0
           AND (r.id IS NULL OR NOT EXISTS (
             SELECT 1 FROM receiving_unbox ru_nu
              WHERE ru_nu.receiving_id = r.id
                AND ru_nu.organization_id = r.organization_id
                AND ru_nu.unboxed_at IS NOT NULL
           ))
           AND rl.workflow_status NOT IN (
             'UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE','FAILED','RTV','SCRAP'
           )`;

export interface DeliveredNotUnboxedItem {
  receiving_line_id: number;
  /** Parent carton FK — null on a line not yet linked to one. Ticket-anchor input. */
  receiving_id: number | null;
  shipment_id: number | null;
  carrier: string | null;
  tracking_number_raw: string | null;
  delivered_at: string | null;
  zoho_purchaseorder_id: string | null;
  po_number: string | null;
  vendor_name: string | null;
  expected_delivery_date: string | null;
  po_date: string | null;
  item_name: string | null;
  sku: string | null;
  workflow_status: string | null;
  was_scanned: boolean;
  /** Hours-since-delivered SLA band — the shared bands owned by delivered-unscanned. */
  age_band: DeliveredUnscannedAgeBand | null;
  /** eBay claim deadline as a civil date (`YYYY-MM-DD`); NULL for non-eBay lines. */
  claim_by_date: string | null;
}

export async function getDeliveredNotUnboxedCount(orgId: OrgId): Promise<number> {
  // Lazy, like the delivered-unscanned sibling: keeps this module's pure SQL
  // fragments importable without instantiating the Neon pool at module load
 // (bundle altitude).
  const { tenantQuery } = await import('@/lib/tenancy/db');
  const { rows } = await tenantQuery<{ n: number }>(
    orgId,
    `SELECT COUNT(DISTINCT COALESCE(rz.zoho_purchaseorder_id, rl.id::text))::int AS n
       FROM receiving_line rl
       LEFT JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id
        AND rz.organization_id = rl.organization_id
       LEFT JOIN receiving_carton r ON (
            r.id = rl.receiving_id
         OR (rl.receiving_id IS NULL
             AND r.source = 'zoho_po'
             AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
             AND r.organization_id = rl.organization_id)
         OR (rl.receiving_id IS NULL
             AND r.source = 'ebay'
             AND r.source_order_id = rl.source_order_id
             AND r.organization_id = rl.organization_id)
       )
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
       LEFT JOIN zoho_po_mirror mirror ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
      WHERE rl.organization_id = $1
        AND stn.is_delivered = true
        AND stn.delivered_at > NOW() - ($2 || ' days')::interval
        AND ${NOT_UNBOXED_PREDICATE}
        -- Exit rule: a written-off line leaves the lane. Keyed on the exception's
        -- OPEN status, so resolving it (the carton turned up) returns the row.
        AND ${NO_OPEN_LOSS_EXCEPTION_PREDICATE}
        AND (
          rz.zoho_purchaseorder_id IS NOT NULL AND ${NOT_ZOHO_RECEIVED_PREDICATE}
          OR rl.inbound_source_type = 'ebay'
        )`,
    [orgId, String(DELIVERED_NOT_UNBOXED_WINDOW_DAYS)],
  );
  return rows[0]?.n ?? 0;
}

export async function listDeliveredNotUnboxed(orgId: OrgId): Promise<DeliveredNotUnboxedItem[]> {
  const { tenantQuery } = await import('@/lib/tenancy/db');
  const { rows } = await tenantQuery<DeliveredNotUnboxedItem>(
    orgId,
    `SELECT DISTINCT ON (rl.id)
            rl.id                              AS receiving_line_id,
            -- The line's OWN carton FK, not r.id: the r join is a loose
            -- multi-condition match (source_order_id / zoho PO), so r.id can name a
            -- sibling carton. A ticket must anchor to this line's actual carton.
            rl.receiving_id                    AS receiving_id,
            stn.id                             AS shipment_id,
            stn.carrier,
            stn.tracking_number_raw,
            stn.delivered_at::text             AS delivered_at,
            rz.zoho_purchaseorder_id,
            COALESCE(mirror.zoho_purchaseorder_number, rl.source_order_id)
                                               AS po_number,
            COALESCE(mirror.vendor_name, rl.item_name) AS vendor_name,
            mirror.expected_delivery_date::text AS expected_delivery_date,
            mirror.po_date::text               AS po_date,
            rl.item_name,
            rl.sku,
            rl.workflow_status::text           AS workflow_status,
            (${SHIPMENT_SCANNED_PREDICATE})    AS was_scanned,
            ${deliveredUnscannedAgeBandSql('stn.delivered_at')} AS age_band,
            ${ebayClaimByDateSql('$4')}        AS claim_by_date
       FROM receiving_line rl
       LEFT JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id
        AND rz.organization_id = rl.organization_id
       LEFT JOIN receiving_carton r ON (
            r.id = rl.receiving_id
         OR (rl.receiving_id IS NULL
             AND r.source = 'zoho_po'
             AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
             AND r.organization_id = rl.organization_id)
         OR (rl.receiving_id IS NULL
             AND r.source = 'ebay'
             AND r.source_order_id = rl.source_order_id
             AND r.organization_id = rl.organization_id)
       )
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
       LEFT JOIN zoho_po_mirror mirror ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
      WHERE rl.organization_id = $1
        AND stn.is_delivered = true
        AND stn.delivered_at > NOW() - ($2 || ' days')::interval
        AND ${NOT_UNBOXED_PREDICATE}
        -- Exit rule: a written-off line leaves the lane. Keyed on the exception's
        -- OPEN status, so resolving it (the carton turned up) returns the row.
        AND ${NO_OPEN_LOSS_EXCEPTION_PREDICATE}
        AND (
          rz.zoho_purchaseorder_id IS NOT NULL AND ${NOT_ZOHO_RECEIVED_PREDICATE}
          OR rl.inbound_source_type = 'ebay'
        )
      ORDER BY rl.id, stn.delivered_at DESC NULLS LAST
      LIMIT $3`,
    [
      orgId,
      String(DELIVERED_NOT_UNBOXED_WINDOW_DAYS),
      DELIVERED_NOT_UNBOXED_CAP,
      String(EBAY_CLAIM_WINDOW_DAYS),
    ],
  );
  return rows;
}
