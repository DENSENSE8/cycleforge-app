/** Pure carrier-tracking resolver for Zoho-received check rows. */

import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

type CheckZohoReceivedCarrierRow = {
  tracking: string;
  po_number: string | null;
  reference_number: string | null;
};

/** Carrier tracking for a check row. */
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
