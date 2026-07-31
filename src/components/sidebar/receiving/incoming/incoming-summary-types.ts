/** Facet bucket — mirrors the SQL CASE in /api/receiving-lines view=incoming. */
export type IncomingDeliveryState =
  | 'DELIVERED_UNOPENED'
  | 'DELIVERED_NOT_UNBOXED'
  | 'ARRIVING_TODAY'
  | 'STALLED'
  | 'IN_TRANSIT'
  | 'TRACKING_UNAVAILABLE'
  | 'PENDING_CARRIER'
  | 'CARRIER_MISMATCH'
  | 'AWAITING_TRACKING'
  | 'WRONG_DESTINATION';

export interface IncomingSummary {
  issued: number;
  delivered_unopened: number;
  /** Delivered, nothing unboxed against it. Drives the Incoming STATUS tile of the same name. */
  delivered_not_unboxed: number;
  /** Hunt-queue claims band: delivered >48h, still unscanned. */
  delivered_unscanned_claims: number;
  arriving_today: number;
  stalled: number;
  in_transit: number;
  pending_carrier: number;
  carrier_mismatch: number;
  tracking_unavailable: number;
  awaiting_tracking: number;
  expected_today: number;
  wrong_destination?: number;
  /** eBay incoming lines still awaiting their Zoho PO link (0 unless Universal Incoming is on). */
  ebay_pending?: number;
  /** Total incoming eBay purchasing-account lines (0 unless Universal Incoming is on). */
  ebay_incoming?: number;
  /** Whether the org has the eBay purchasing account wired in (drives the eBay tab/KPI). */
  universal_incoming?: boolean;
}
