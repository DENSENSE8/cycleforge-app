import { withJobReturn } from '@/lib/mobile/nav-trail';
import { fetchShipmentRecord, lookupShipmentByTracking } from '@/lib/shipments/shipment-record-client';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { shipmentHubHref } from './useShipmentHub';

/**
 * Where an OUTBOUND package lands, or null when the record is not one.
 *
 * - packed, scanned out, or holding an unmatched pack scan → the package hub
 *   (nothing is left to do on its order; the hub is the whole story);
 * - only a label bought against an order line → that order's hub (the order
 *   still has open work — pick / pack — and that is where it happens);
 * - no outbound evidence (an inbound PO tracking that shares the table) → null.
 */
export function outboundScanHref(record: ShipmentRecord, back: string): string | null {
  if (record.pack || record.shipOut || record.exception) {
    return withJobReturn(shipmentHubHref(record.shipmentId), back);
  }
  const line = record.items[0];
  return line ? withJobReturn(`/m/orders/${line.orderRowId}?by=id`, back) : null;
}

/**
 * `/m/scan`'s outbound check for a carrier tracking number the receiving
 * door has never seen: a box we packed or shipped is not an inbound arrival.
 * Any read failure answers null, so the scan falls through to intake exactly
 * as before — never a stranded scan.
 */
export async function landOutboundTracking(tracking: string, back: string): Promise<string | null> {
  try {
    const hit = await lookupShipmentByTracking(tracking);
    if (!hit) return null;
    return outboundScanHref(await fetchShipmentRecord(hit.shipmentId), back);
  } catch {
    return null;
  }
}
