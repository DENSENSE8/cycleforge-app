const DEFAULT_REFRESH_LEAD_MS = 5_000;
const MIN_REFRESH_DELAY_MS = 250;

/**
 * Returns when the browser should replace its WMS socket so the next
 * connection receives a fresh, short-lived ticket. The ticket remains
 * server-verified on every message; this only prevents a healthy-looking
 * long-lived socket from retaining expired credentials.
 */
export function wmsTicketRefreshDelayMs(
  expiresAt: string,
  nowMs = Date.now(),
  refreshLeadMs = DEFAULT_REFRESH_LEAD_MS,
): number {
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs)) return MIN_REFRESH_DELAY_MS;
  return Math.max(MIN_REFRESH_DELAY_MS, expiryMs - nowMs - refreshLeadMs);
}

