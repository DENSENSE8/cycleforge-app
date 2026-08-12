/**
 * Stable per-row rail keys — a dependency-free, server-safe home for the rail's
 * React / AnimatePresence identity. It used to live in `receiving-queries.ts` (a
 * `'use client'` module); it moved here so the RSC first-paint rail seed can
 * produce byte-identical `client_event_id`s WITHOUT pulling that client module
 * into the server graph (where its exports would resolve to uncallable
 * client-reference proxies). `receiving-queries.ts` re-exports it for its
 * existing client importers.
 *
 * ## The key is SHIPMENT-first, and that is the whole point
 *
 * A tracking scan is the common Unbox entry, and at t=0 the only identity we
 * hold is the scanned tracking — the carton id does not exist yet. Keying the
 * rail on `carton:{id}` therefore forced every scan through a key CHANGE
 * (`scan:{tracking}` → `carton:{id}`) the moment the carton resolved, and the
 * rail's `AnimatePresence` reads a changed key as "one row left, another
 * arrived": the operator watched their tracking number appear, vanish, and come
 * back. Keying on the shipment instead means the pending stub, the optimistic
 * carton row, and the authoritative `view=unbox_opened` row all carry the SAME
 * key, so the row is updated in place and never unmounts.
 *
 * `carton:{id}` remains the fallback for a row with no shipment — a typed
 * order#/PO scan, a local pickup, an unfound carton with no carrier tracking.
 * That is the "order number join" half: those rows have no shipment to key on,
 * and they were never the flickering case.
 */

import { normalizeScanKey } from '@/lib/receiving/scan/normalize';

/** Stable React list key for one carton (no shipment / trackingless rows). */
export function receivingRailCartonKey(receivingId: number): string {
  return `carton:${receivingId}`;
}

/**
 * Stable React list key for one SHIPMENT, derived from its tracking number.
 *
 * Canonicalized through the same `normalizeScanKey` the scan rungs and the
 * `?tracking_in=` filter use, so `1z999-aa1 01` scanned and `1Z999AA101`
 * stored resolve to one key. Returns null when there is nothing to key on.
 */
export function receivingRailShipmentKey(
  trackingNumber: string | null | undefined,
): string | null {
  const key = normalizeScanKey(String(trackingNumber ?? ''));
  return key ? `stn:${key}` : null;
}

/** True for a key minted by {@link receivingRailShipmentKey}. */
export function isReceivingRailShipmentKey(key: string | null | undefined): boolean {
  return typeof key === 'string' && key.startsWith('stn:');
}

/**
 * The durable rail key ladder: shipment → carton → line id.
 *
 * Every producer of a rail row (the pending scan stub, both scan-apply
 * optimistic paths, the `view=unbox_opened` fetcher and its RSC seed) stamps
 * `client_event_id` through this, which is what makes the stub→real swap an
 * in-place update instead of a remount.
 */
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
