/** Phase 0 resolver — find an already-MATERIALIZED carton row (`receiving_id` set) among the receiving-feed rows that matches the scanned… */

import { looksLikeTicketScan } from '@/lib/support/ticket-scan';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import type { CachedCartonDeps, CachedCartonResolution, ScanInput } from '../types';
import { normalizeScanKey } from '../normalize';

export function resolveCachedCarton(
  input: ScanInput,
  deps: CachedCartonDeps,
): CachedCartonResolution | null {
  const key = normalizeScanKey(input.value);
  if (!key) return null;
  // Tracking compares CANONICAL forms: an IMpb / GS1-concat label spelling
  // must hit the carton stored under its human tracking number.
  const trackingKey = extractCanonicalTracking(input.value);

  // Armed mode matches only its own field; `auto` deep-scans PO# / tracking# /
  // ticket# (ticket only when the value looks like `#NNNN`) so an already-open
  // Unboxed row wins instantly — same identities as lookup-po.
  const matchOrder = input.mode === 'order' || input.mode === 'auto';
  const matchTracking = input.mode === 'tracking' || input.mode === 'auto';
  const matchTicket =
    input.mode === 'ticket'
    || (input.mode === 'auto' && looksLikeTicketScan(input.value));

  const matches = deps.readCachedRows().filter((r) => {
    if (r.receiving_id == null) return false;
    if (matchOrder && r.zoho_purchaseorder_number && normalizeScanKey(r.zoho_purchaseorder_number) === key) {
      return true;
    }
    if (matchTracking && r.tracking_number && extractCanonicalTracking(r.tracking_number) === trackingKey) {
      return true;
    }
    // `zendesk_ticket` is stored as `#<id>` (rail / carton-context chip); strip
    // via normalizeScanKey so `#9575` and `9575` both hit.
    if (matchTicket && r.zendesk_ticket && normalizeScanKey(r.zendesk_ticket) === key) {
      return true;
    }
    return false;
  });
  if (matches.length === 0) return null;

  // Prefer an OPEN line (received < expected, or unknown expected) so the
  // workspace lands on something actionable; else the first match.
  const open = matches.find(
    (r) => r.quantity_expected == null || r.quantity_received < (r.quantity_expected ?? 0),
  );
  const row = open ?? matches[0];
  if (row.receiving_id == null) return null;

  const poIds = row.zoho_purchaseorder_id?.trim() ? [row.zoho_purchaseorder_id.trim()] : [];
  return { kind: 'cached-carton', row, receivingId: row.receiving_id, poIds };
}
