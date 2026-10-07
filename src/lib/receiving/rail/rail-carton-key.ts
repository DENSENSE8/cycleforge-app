/** Stable per-row rail keys — a dependency-free, server-safe home for the rail's React / AnimatePresence identity. */

import { extractCanonicalTracking } from '@/lib/tracking-format';

/** Stable React list key for one carton (no shipment / trackingless rows). */
export function receivingRailCartonKey(receivingId: number): string {
  return `carton:${receivingId}`;
}

/**
 * Stable React list key for one SHIPMENT, derived from its CANONICAL tracking
 * number — a USPS IMpb (`420`+ZIP) or FedEx GS1 (`96…`) label spelling keys
 * the same as the stored tracking, so a re-scan lands on the carton's own row.
 */
export function receivingRailShipmentKey(
  trackingNumber: string | null | undefined,
): string | null {
  const key = extractCanonicalTracking(String(trackingNumber ?? ''));
  return key ? `stn:${key}` : null;
}

/** True for a key minted by {@link receivingRailShipmentKey}. */
export function isReceivingRailShipmentKey(key: string | null | undefined): boolean {
  return typeof key === 'string' && key.startsWith('stn:');
}

/** The durable rail key ladder: */
export function receivingRailRowKey(row: {
  tracking_number?: string | null;
  receiving_id?: number | null;
  id?: number | null;
}): string | number {
  const shipment = receivingRailShipmentKey(row.tracking_number);
  if (shipment) return shipment;
  const rid = row.receiving_id;
  if (rid != null && Number.isFinite(Number(rid))) return receivingRailCartonKey(Number(rid));
  return row.id ?? 0;
}
