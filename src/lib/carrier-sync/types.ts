import type { CarrierCode, NormalizedShipmentStatus } from '@/lib/shipping/types';

/**
 * Live per-carrier sync feed for POST /api/receiving-lines/incoming/refresh/stream.
 * Mirrors the orders-sync NDJSON contract (see
 * {@link import('@/lib/orders-sync/types').SyncStreamEvent}) but is keyed by
 * carrier instead of source.
 */

/** One shipment's outcome from a single re-poll. */
export interface CarrierSyncShipmentDetail {
  shipmentId: number;
  /** Normalized tracking number (the dialog shows only the last 4). */
  tracking: string;
  /** Status category before this poll (null when never polled). */
  previousStatus: NormalizedShipmentStatus | null;
  /** Status category the carrier reported on this poll. */
  newStatus: NormalizedShipmentStatus | null;
  /** New carrier events written this poll (0 = no movement). */
  eventsInserted: number;
  /**
   * Bucket the row lands in:
   *  - delivered: flipped to a terminal state (DELIVERED / RETURNED)
   *  - updated:   non-terminal status with fresh carrier events
   *  - unchanged: polled successfully but nothing new
   *  - error:     the carrier poll failed
   */
  kind: 'delivered' | 'updated' | 'unchanged' | 'error';
  error?: string;
}

/** Aggregate counts mirroring the non-streaming refresh summary. */
export interface CarrierSyncResult {
  scanned: number;
  delivered: number;
  updated: number;
  errors: number;
  capped: boolean;
  throttled?: boolean;
}

/**
 * NDJSON events streamed from POST /api/receiving-lines/incoming/refresh/stream.
 * Each line of the response body is one JSON-encoded event.
 */
export type CarrierSyncStreamEvent =
  | { type: 'carrier-start'; carrier: CarrierCode; total: number }
  | { type: 'detail'; carrier: CarrierCode; row: CarrierSyncShipmentDetail }
  | { type: 'carrier-done'; carrier: CarrierCode }
  | { type: 'result'; result: CarrierSyncResult }
  | { type: 'error'; error: string };
