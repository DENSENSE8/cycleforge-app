/**
 * Shipment-anchored "delivered, no dock scan yet" boxes (incoming-only).
 * The dedicated `/incoming/delivered-unscanned` feed is the sole read model for
 * the DELIVERED_UNOPENED hunt facet — the main receiving-lines query is disabled
 * while this facet is active (see useReceivingLinesData).
 *
 * The endpoint resolves each box's Zoho PO from its tracking#, so PO#, vendor,
 * dates, product/item name, age band, and Zoho status ride along.
 */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export interface DeliveredUnscanned {
  shipment_id: number;
  carrier: string;
  tracking_number_raw: string;
  tracking_number_normalized: string;
  delivered_at: string | null;
  source_system: string | null;
  /** Mirrors SoT age bands — `lt_24h` | `h24_48` | `gt_48h`. */
  age_band?: 'lt_24h' | 'h24_48' | 'gt_48h' | null;
  zoho_purchaseorder_id: string | null;
  /** Zoho mirror status — badge only; never gates hunt-queue membership. */
  zoho_status?: string | null;
  po_number: string | null;
  vendor_name: string | null;
  expected_delivery_date: string | null;
  po_date: string | null;
  first_item_name: string | null;
  first_sku: string | null;
  item_count: number | null;
}

export interface DeliveredUnscannedResponse {
  success: boolean;
  count: number;
  window_days: number;
  claims_count?: number;
  items: DeliveredUnscanned[];
}

/**
 * Recover the real `shipping_tracking_numbers.id` from a shipment-anchored
 * delivered-unscanned row, or null if `row` isn't one. Reads the explicit
 * {@link ReceivingLineRow.shipment_ref} field — never decodes `row.id`, which is
 * a namespaced negative React key with no identity contract. A delivered-unscanned
 * row is the only producer of `tracking_source === 'shipment'` + null `receiving_id`
 * carrying a `shipment_ref` (see {@link deliveredUnscannedToRow}).
 */
export function shipmentIdFromDeliveredUnscannedRow(row: ReceivingLineRow): number | null {
  if (row.tracking_source !== 'shipment' || row.receiving_id != null) return null;
  const shipmentId = row.shipment_ref;
  return typeof shipmentId === 'number' && Number.isFinite(shipmentId) && shipmentId > 0
    ? shipmentId
    : null;
}

/**
 * Remap a shipment-anchored "delivered but not dock-scanned" box onto the
 * standard {@link ReceivingLineRow} shape so the "Delivered · not scanned"
 * facet renders through the same Incoming grid pipeline.
 */
export function deliveredUnscannedToRow(item: DeliveredUnscanned): ReceivingLineRow {
  const itemCount = item.item_count ?? 0;
  const productTitle = item.first_item_name
    ? itemCount > 1
      ? `${item.first_item_name} +${itemCount - 1} more`
      : item.first_item_name
    : item.po_number
      ? `PO ${item.po_number}`
      : 'Delivered · needs receiving';

  const zohoTerminal =
    item.zoho_status &&
    ['billed', 'closed', 'cancelled', 'received', 'rejected'].includes(
      item.zoho_status.toLowerCase(),
    );

  return {
    // Negative, collision-free React key (real line ids are positive BIGSERIALs);
    // the true shipment id rides in `shipment_ref`, not encoded in this value.
    id: -item.shipment_id,
    receiving_id: null,
    shipment_ref: item.shipment_id,
    tracking_number: item.tracking_number_raw,
    tracking_source: 'shipment',
    carrier: item.carrier,
    shipment_status: 'DELIVERED',
    is_delivered: true,
    delivered_at: item.delivered_at,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: item.zoho_purchaseorder_id,
    zoho_purchaseorder_number: item.po_number,
    item_name: productTitle,
    sku: item.first_sku,
    quantity_received: 0,
    quantity_expected: itemCount > 0 ? itemCount : null,
    qa_status: 'PENDING',
    workflow_status: 'EXPECTED',
    disposition_code: 'HOLD',
    condition_grade: 'BRAND_NEW',
    disposition_audit: [],
    needs_test: false,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: 'PO',
    notes: zohoTerminal ? `Zoho: ${item.zoho_status}` : null,
    delivery_state: 'DELIVERED_UNOPENED',
    delivered_age_band: item.age_band ?? null,
    zoho_status: item.zoho_status ?? null,
    po_date: item.po_date,
    expected_delivery_date: item.expected_delivery_date,
    vendor_name: item.vendor_name,
    created_at: item.delivered_at,
    last_activity_at: item.delivered_at,
    image_url: null,
    source_platform: null,
    is_priority: item.age_band === 'gt_48h',
    priority_tier: null,
    receiving_source: 'unmatched',
    serials: [],
    photo_count: 0,
    zendesk_ticket: null,
  };
}
