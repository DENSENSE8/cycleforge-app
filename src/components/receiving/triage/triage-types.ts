/** Types for the receiving-triage right panel. */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/**
 * A normalized inbound package under triage, derived from a `ReceivingLineRow`.
 * The panel renders from this — never from raw row fields — so the display stays
 * dumb and the derivation rules live in one place (`toTriagePackage`).
 */
export interface TriagePackage {
  lineId: number;
  receivingId: number | null;
  tracking: string | null;
  carrier: string | null;
  /** Best available arrival timestamp + which event it represents. */
  arrivalAt: string | null;
  arrivalLabel: 'Received' | 'Scanned' | 'Logged' | null;
  /** ebay | amazon | ecwid | fba | … (lowercase slug from source-platform SoT). */
  sourcePlatform: string | null;
  isReturn: boolean;
  /** po | return | trade_in (effective line intake type) | null. */
  intakeType: string | null;
  /** True for a no-Zoho-PO carton (the classic unmatched-inbound triage case). */
  isUnmatched: boolean;
  zohoPoId: string | null;
  poNumber: string | null;
  vendorName: string | null;
  itemName: string | null;
  sku: string | null;
  qtyReceived: number;
  qtyExpected: number | null;
  /** "#1234" when a Zendesk ticket is already linked. */
  zendeskTicket: string | null;
  imageUrl: string | null;
}

/** Derive the dumb-render `TriagePackage` from a receiving line row. */
export function toTriagePackage(row: ReceivingLineRow): TriagePackage {
  const intakeType =
    row.intake_type ??
    (row.carton_intake_type ? row.carton_intake_type.toLowerCase() : null);
  const isReturn =
    intakeType === 'return' ||
    (row.source_platform ?? '').toLowerCase().includes('return');

  // Prefer the most meaningful arrival event we have a timestamp for.
  let arrivalAt: string | null = null;
  let arrivalLabel: TriagePackage['arrivalLabel'] = null;
  if (row.received_at) {
    arrivalAt = row.received_at;
    arrivalLabel = 'Received';
  } else if (row.scanned_at) {
    arrivalAt = row.scanned_at;
    arrivalLabel = 'Scanned';
  } else if (row.created_at) {
    arrivalAt = row.created_at;
    arrivalLabel = 'Logged';
  }

  return {
    lineId: row.id,
    receivingId: row.receiving_id,
    tracking: row.tracking_number,
    carrier: row.carrier,
    arrivalAt,
    arrivalLabel,
    sourcePlatform: row.source_platform_pill ?? row.source_platform ?? null,
    isReturn,
    intakeType,
    isUnmatched: row.receiving_source === 'unmatched',
    zohoPoId: row.zoho_purchaseorder_id,
    poNumber: row.zoho_purchaseorder_number,
    vendorName: row.vendor_name ?? null,
    itemName:
      row.zoho_item_title ??
      row.catalog_product_title ??
      row.item_name ??
      null,
    sku: row.sku,
    qtyReceived: row.quantity_received,
    qtyExpected: row.quantity_expected,
    zendeskTicket: row.zendesk_ticket ?? null,
    imageUrl: row.image_url,
  };
}
