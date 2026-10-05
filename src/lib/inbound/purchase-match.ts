/**
 * Pure: is an eBay buyer purchase the same real-world order as a Zoho PO?
 * The ONE rule — the eBay ↔ Zoho merge (`mergeEbayLinesIntoZohoPo`) collapses
 * lines by it, and the pasted-number facts (`pastedNumberFacts`) count a
 * purchase's units once by it when the merge never ran. No db, client-safe.
 */

import { normalizeTrackingLast8 } from '@/lib/tracking-format';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

/** An eBay-primary Incoming line that might be the same purchase as a Zoho PO. */
export interface EbayCandidate {
  receivingLineId: number;
  sourceOrderId: string; // eBay order id
  sku: string | null;
  tracking: string | null; // from the eBay reconcile mirror, if any
}

/** The signals that identify a Zoho PO for matching. */
export interface ZohoPoSignals {
  zohoPurchaseOrderId: string;
  poNumber?: string | null;
  tracking?: string | null; // Zoho PO reference# carries tracking (this repo's inbound contract)
  referenceNumber?: string | null;
  notes?: string | null;
}

export type MergeMatchReason = 'tracking' | 'order_number';

/** eBay order ids are long; guard the order#-substring path against short collisions. */
const MIN_ORDER_NUMBER_MATCH_LEN = 8;

/** Returns the strong match reason, or null. Tracking beats order#. */
export function matchZohoPo(candidate: EbayCandidate, po: ZohoPoSignals): MergeMatchReason | null {
  const cTrack = candidate.tracking ? normalizeTrackingLast8(candidate.tracking) : '';
  const pTrack = po.tracking ? normalizeTrackingLast8(po.tracking) : '';
  if (cTrack && pTrack && cTrack === pTrack) return 'tracking';

  const needle = canonicalizeTrackingKey(candidate.sourceOrderId);
  if (needle.length >= MIN_ORDER_NUMBER_MATCH_LEN) {
    // Exact against the structured PO#/reference; substring against free-text notes.
    const exact = [po.poNumber, po.referenceNumber].filter(Boolean).map((s) => canonicalizeTrackingKey(s));
    if (exact.some((h) => h === needle)) return 'order_number';
    const notes = po.notes ? canonicalizeTrackingKey(po.notes) : '';
    if (notes && notes.includes(needle)) return 'order_number';
  }
  return null;
}
