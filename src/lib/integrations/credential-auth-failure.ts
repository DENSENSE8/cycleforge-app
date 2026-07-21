/**
 * Pure classifier: does this error mean the stored OAuth credential is dead?
 * Kept free of DB / server-only imports so unit tests can run without Neon.
 */

/**
 * True when an error means the stored credential itself is unusable (revoked
 * refresh token, mint failure, hard 401) — NOT a resource/business miss like
 * "Purchase Order does not exist." Only auth failures should flip the vault
 * row to `status=error`; poisoning on every Zoho 404 disconnects inventory for
 * the whole org after a single stale PO id.
 */
export function isCredentialAuthFailure(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (!message) return false;
  return (
    message.includes('token refresh') ||
    message.includes('invalid_grant') ||
    message.includes('invalid_code') ||
    message.includes('invalid_token') ||
    message.includes('access_denied') ||
    message.includes('unauthorized') ||
    message.includes('authentication failed') ||
    message.includes('no active zoho connection') ||
    message.includes('no active "') ||
    message.includes('credential not connected') ||
    /\b401\b/.test(message)
  );
}
