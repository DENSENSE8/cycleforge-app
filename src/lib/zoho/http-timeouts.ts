/**
 * Pure Zoho HTTP timeout / abort helpers — kept free of the credential + DB
 * import graph so unit tests can cover Unbox timeout behavior without Neon.
 */

export const ZOHO_HTTP_TIMEOUTS = {
  /** Default per-call abort — GETs and light writes. */
  requestTimeoutMs: 10_000,
  /**
   * Purchase-receive POSTs are known-slow (Zoho often 20–50s before reject or
   * success). A 10s abort × 5 retries was burning ~65s and racing Unbox's 30s
   * client AbortSignal. One long attempt beats five short ones.
   */
  mutationTimeoutMs: 55_000,
} as const;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** True when fetch failed because our AbortController (or the runtime) timed out. */
export function isZohoAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = String((error as { name?: unknown }).name ?? '');
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  const message = String((error as { message?: unknown }).message ?? '');
  return /aborted|timed?\s*out/i.test(message);
}

/**
 * Per-call timeout. Only the slow purchase-receive / markasreceived POSTs get
 * the long window — everything else stays at 10s so a hung GET cannot wedge
 * the process-wide limiter.
 */
export function zohoRequestTimeoutMs(method: HttpMethod, path: string): number {
  if (method !== 'POST') return ZOHO_HTTP_TIMEOUTS.requestTimeoutMs;
  const p = path.toLowerCase();
  if (
    p.includes('/purchasereceives') ||
    p.includes('/markasreceived') ||
    p.includes('/markasunreceived')
  ) {
    return ZOHO_HTTP_TIMEOUTS.mutationTimeoutMs;
  }
  return ZOHO_HTTP_TIMEOUTS.requestTimeoutMs;
}
