/**
 * Pure carrier-tracking resolver for Zoho-received check rows.
 *
 * Lives in its own leaf so client surfaces (Incoming bulk panel) can compose it
 * without pulling `check-zoho-received.ts` — that module `await import`s
 * `tenancy/db`, and a client value-import would fail the `server-only` guard on
 * `@/lib/db`. Same altitude split as `tracking-paste.ts` / `watch-state.ts`.
 */

import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

type CheckZohoReceivedCarrierRow = {
  tracking: string;
  po_number: string | null;
  reference_number: string | null;
};

/**
 * Carrier tracking for a check row.
 *
 * Zoho stores inbound tracking on `reference_number`. When the operator pasted a
 * PO/order number, `row.tracking` is that PO# — painting it as a TrackingChip
 * doubles the order number. Prefer reference_number; fall back to the paste key
 * only when it is not the same canon as the PO#.
 */
export function resolveCheckRowCarrierTracking(
  row: CheckZohoReceivedCarrierRow,
): string | null {
  const ref = (row.reference_number ?? '').trim();
  if (ref) return ref;
  const key = (row.tracking ?? '').trim();
  if (!key) return null;
  const poCanon = row.po_number ? canonicalizeTrackingKey(row.po_number) : '';
  if (poCanon && canonicalizeTrackingKey(key) === poCanon) return null;
  return key;
}
