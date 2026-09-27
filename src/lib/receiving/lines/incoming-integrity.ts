/** Tracking integrity on an Incoming / reconcile / exceptions line — the list feed and the nav locate read it alike. */

import { isWrongDestination } from '@/lib/receiving/wrong-destination';

/**
 * Stamps `tracking_confidence` and `wrong_destination` on a normalized line and
 * moves a delivered-elsewhere line to `WRONG_DESTINATION` (unless received).
 */
export function enrichIncomingTrackingIntegrity(
  row: Record<string, unknown>,
  warehousePostal: string,
): void {
  const hasTracking = Boolean(String(row.tracking_number || '').trim());
  const lastChecked = row.shipment_last_checked_at as string | null;
  const status = row.shipment_status as string | null;
  const latestEvent = row.shipment_latest_event_at as string | null;
  const carrierAnswered = Boolean(lastChecked || status || latestEvent);
  if (hasTracking) {
    row.tracking_confidence = carrierAnswered ? 'carrier_confirmed' : 'seller_reported';
  } else {
    row.tracking_confidence = null;
  }

  const wrong = Boolean(row.is_delivered)
    && isWrongDestination(
      row.shipment_latest_event_postal as string | null,
      warehousePostal,
    );
  row.wrong_destination = wrong;
  if (wrong && row.delivery_state !== 'RECEIVED') {
    row.delivery_state = 'WRONG_DESTINATION';
  }
}
