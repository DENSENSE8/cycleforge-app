/** "Does the vendor side consider this PO received?" — ONE answer, one module. */

/** Zoho statuses that mean "the vendor side considers this PO received". */
export const ZOHO_RECEIVED_LIKE_STATUSES = ['received', 'billed', 'closed'] as const;

/**
 * Zoho PO statuses that mean "no longer incoming" — received, closed out, or
 * cancelled — so the PO must not show on the Incoming surface even if a local
 * EXPECTED row lingers. A NULL/missing mirror status is treated as still-incoming.
 */
export const ZOHO_TERMINAL_STATUSES = ['billed', 'closed', 'cancelled', 'received', 'rejected'] as const;

type ZohoReceivedLikeStatus = (typeof ZOHO_RECEIVED_LIKE_STATUSES)[number];

const RECEIVED_LIKE = new Set<string>(ZOHO_RECEIVED_LIKE_STATUSES.map((s) => s.toLowerCase()));

/** True when a Zoho (or mirror) status means the vendor side considers the PO received. */
export function isZohoReceivedLikeStatus(
  status: string | null | undefined,
): status is ZohoReceivedLikeStatus {
  const s = String(status ?? '')
    .trim()
    .toLowerCase();
  return s.length > 0 && RECEIVED_LIKE.has(s);
}
