/** Facet bucket — mirrors the SQL CASE in /api/receiving-lines view=incoming. */
export type IncomingDeliveryState =
  | 'DELIVERED_UNOPENED'
  | 'DELIVERED_NOT_UNBOXED'
  | 'DELIVERED_EMAIL'
  | 'ARRIVING_TODAY'
  | 'STALLED'
  | 'IN_TRANSIT'
  | 'TRACKING_UNAVAILABLE'
  | 'PENDING_CARRIER'
  | 'CARRIER_MISMATCH'
  | 'AWAITING_TRACKING'
  | 'WRONG_DESTINATION';

export interface IncomingCarrierBreakdown {
  carrier: 'UPS' | 'USPS' | 'FEDEX' | 'UNKNOWN' | string;
  delivered_unscanned: number;
  tracking_unavailable: number;
  in_transit: number;
  carrier_mismatch: number;
}

export interface IncomingSummary {
  issued: number;
  delivered_unopened: number;
  delivered_not_unboxed: number;
  delivered_email: number;
  arriving_today: number;
  stalled: number;
  in_transit: number;
  pending_carrier: number;
  carrier_mismatch: number;
  tracking_unavailable: number;
  awaiting_tracking: number;
  expected_today: number;
  wrong_destination?: number;
  by_carrier?: IncomingCarrierBreakdown[];
  /** eBay incoming lines still awaiting their Zoho PO link (0 unless Universal Incoming is on). */
  ebay_pending?: number;
  /** Total incoming eBay purchasing-account lines (0 unless Universal Incoming is on). */
  ebay_incoming?: number;
  /** Whether the org has the eBay purchasing account wired in (drives the eBay tab/KPI). */
  universal_incoming?: boolean;
}
