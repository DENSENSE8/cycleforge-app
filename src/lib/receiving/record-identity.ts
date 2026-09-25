import type { ReceivingLineRow } from './receiving-line-row';
import { listingLinksForReceivingRow, listingUrlItemId, normalizeListingHref } from './listing-links';

export function receivingRecordIdentity(row: ReceivingLineRow) {
  const explicit = normalizeListingHref(row.listing_url) ?? normalizeListingHref(row.receiving_listing_url);
  const candidates = explicit ? [] : listingLinksForReceivingRow(row);
  // A multi-item PO note can name several different listings. Do not silently
  // paint the first item's number on every sibling line.
  const listingHref = explicit ?? (candidates.length === 1 ? candidates[0]!.href : null);
  return {
    orderNumber: row.zoho_purchaseorder_number || row.source_order_id || null,
    accountSource: row.source_platform_pill || row.platform_account_label || row.source_platform || row.inbound_source_type || null,
    listingHref,
    // Never substitute a PO id, SKU, URL slug, or receiving-line id for a marketplace item.
    itemNumber: listingUrlItemId(listingHref) || null,
  };
}

/** Full persisted serials, with per-unit materialisation as a fallback. Never truncate for claims. */
export function receivingRecordSerials(row: ReceivingLineRow): string[] {
  return [...new Set([
    ...(row.serials ?? []).map((unit) => unit.serial_number),
    ...(row.units ?? []).map((unit) => unit.serial),
  ].map((value) => (value ?? '').trim()).filter(Boolean))];
}

/** A missing requested line must never borrow a sibling's serials or receipt. */
export function receivingDetailLine(rows: readonly ReceivingLineRow[], lineId: number | null): ReceivingLineRow | null {
  return lineId == null ? rows[0] ?? null : rows.find((row) => row.id === lineId) ?? null;
}

export function receivingSerialCountWarning(row: ReceivingLineRow): string | null {
  const count = receivingRecordSerials(row).length;
  if (row.quantity_expected != null && count > row.quantity_expected) {
    return `${count} serials are linked to ${row.quantity_expected} expected units. Review the unit count.`;
  }
  if (row.received_done_at && count > (row.quantity_received ?? 0)) {
    return `${count} serials are linked to ${row.quantity_received ?? 0} received units after receipt completion. Review the unit count.`;
  }
  return null;
}
