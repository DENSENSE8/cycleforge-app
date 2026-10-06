/**
 * When a location scan proof stops authorizing writes, read from its own
 * claims (the payload is signed, not secret). The server still decides; this
 * only lets the screen say "scan it again" before a ±1 bounces.
 * Returns epoch milliseconds, or null for anything unreadable.
 */
export function locationScanProofExpiresAt(token: string | null): number | null {
  const payload = token?.split('.')[0];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    if (!claims || typeof claims !== 'object' || !('expiresAt' in claims)) return null;
    const expiresAt = claims.expiresAt;
    return typeof expiresAt === 'number' && Number.isFinite(expiresAt) ? expiresAt * 1_000 : null;
  } catch {
    return null;
  }
}
