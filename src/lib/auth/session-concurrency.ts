/** maxConcurrentSessions enforcement. */

export interface ActiveSid {
  sid: string;
  lastSeenAt: Date;
}

export interface ConcurrencyDeps {
  /** Active (unrevoked, unexpired) sids for a staff. Order-independent — we sort. */
  listActiveSids(staffId: number): Promise<ActiveSid[]>;
  revokeSids(sids: string[]): Promise<void>;
}

/**
 * Trim `staffId`'s active sessions to at most `limit`, revoking the oldest.
 * `limit <= 0` means unlimited (no-op). Returns the sids revoked.
 */
export async function enforceMaxConcurrentSessions(
  staffId: number,
  limit: number,
  deps: ConcurrencyDeps,
): Promise<string[]> {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const active = await deps.listActiveSids(staffId);
  if (active.length <= limit) return [];
  // Newest first, then drop everything past the limit (the oldest).
  const sorted = [...active].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  const toRevoke = sorted.slice(limit).map((s) => s.sid);
  if (toRevoke.length) await deps.revokeSids(toRevoke);
  return toRevoke;
}
