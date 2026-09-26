/** Pure classifiers: */

/**
 * True when the failure is a provider-side throttle, timeout, or 5xx blip: the
 * credential is fine and the next attempt may well succeed. These must be
 * retried/backed off, never latched.
 */
export function isTransientCredentialFailure(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (!message) return false;
  return (
    // Throttles. Zoho's token endpoint answers 400 + "Access Denied" +
    // "too many requests continuously"; its API answers 429 / code 44|45|1070.
    message.includes('too many requests') ||
    message.includes('rate limit') ||
    message.includes('ratelimit') ||
    message.includes('try again after some time') ||
    message.includes('throttl') ||
    /\b429\b/.test(message) ||
    // Network / upstream unavailability.
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('fetch failed') ||
    message.includes('aborted') ||
    message.includes('service unavailable') ||
    message.includes('bad gateway') ||
    message.includes('gateway timeout') ||
    /\b50[0234]\b/.test(message) ||
    // Our own breaker refusing to call out — says nothing about the credential.
    message.includes('circuit open')
  );
}

/** True when an error means the stored credential itself is unusable (revoked refresh token, mint failure, hard 401) — NOT a… */
export function isCredentialAuthFailure(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (!message) return false;
  // Transient wins: a throttled mint is not a dead credential.
  if (isTransientCredentialFailure(err)) return false;
  return (
    message.includes('token refresh') ||
    message.includes('invalid_grant') ||
    message.includes('invalid_code') ||
    message.includes('invalid_token') ||
    message.includes('invalid_client') ||
    message.includes('access_denied') ||
    message.includes('unauthorized') ||
    message.includes('authentication failed') ||
    message.includes('no active zoho connection') ||
    message.includes('no active "') ||
    message.includes('credential not connected') ||
    /\b401\b/.test(message)
  );
}
