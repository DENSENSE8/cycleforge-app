import { withJobReturn } from '@/lib/mobile/nav-trail';
import { fetchShipmentRecord, lookupShipmentByTracking } from '@/lib/shipments/shipment-record-client';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { shipmentHubHref } from './useShipmentHub';

/** Where an OUTBOUND package lands, or null when the record is not one. */
export function outboundScanHref(record: ShipmentRecord, back: string): string | null {
  if (record.pack || record.shipOut || record.exception) {
    return withJobReturn(shipmentHubHref(record.shipmentId), back);
  }
  const line = record.items[0];
  return line ? withJobReturn(`/m/orders/${line.orderRowId}?by=id`, back) : null;
}

/** `/m/scan`'s outbound check for a carrier tracking number the receiving door has never seen: */
export async function landOutboundTracking(tracking: string, back: string): Promise<string | null> {
  try {
    const hit = await lookupShipmentByTracking(tracking);
    if (!hit) return null;
    return outboundScanHref(await fetchShipmentRecord(hit.shipmentId), back);
  } catch {
    return null;
  }
}
