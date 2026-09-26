/** Pickability predicate — central rule for "can this unit be picked from this bin?" */


// ─── Types ───────────────────────────────────────────────────────────────────

type BinRole =
  | 'PICK_FACE'
  | 'RESERVE'
  | 'STAGING'
  | 'DOCK'
  | 'QUARANTINE'
  | 'DAMAGED'
  | 'RETURNS'
  | 'RECEIVING';

interface PickabilityCandidate {
  serialStatus: string;
  binRole: BinRole | null;
  lockedForCount: boolean;
  expiresAt: Date | string | null;
}

type PickabilityReason =
  | 'WRONG_STATUS'
  | 'BIN_ROLE_BLOCKED'
  | 'BIN_LOCKED_FOR_COUNT'
  | 'EXPIRED';

type PickabilityResult =
  | { ok: true }
  | { ok: false; reason: PickabilityReason; detail: string };

// Bin roles where units are NOT allocatable. Flipping these is a config call;
// keep the list in code so the WMS can run without enum-membership lookups.
const NON_PICKABLE_ROLES: ReadonlySet<BinRole> = new Set([
  'STAGING',
  'DOCK',
  'QUARANTINE',
  'DAMAGED',
  'RETURNS',
  'RECEIVING',
]);

// ─── In-memory predicate (post-fetch validation) ─────────────────────────────

/**
 * Validate a candidate unit + bin pair. Used in write paths after the row is
 * locked via `FOR UPDATE` so we don't race on stale read.
 */
function isAllocatable(candidate: PickabilityCandidate): PickabilityResult {
  if (candidate.serialStatus !== 'STOCKED') {
    return { ok: false, reason: 'WRONG_STATUS', detail: `current_status=${candidate.serialStatus}` };
  }
  if (candidate.binRole && NON_PICKABLE_ROLES.has(candidate.binRole)) {
    return { ok: false, reason: 'BIN_ROLE_BLOCKED', detail: `bin_role=${candidate.binRole}` };
  }
  if (candidate.lockedForCount) {
    return { ok: false, reason: 'BIN_LOCKED_FOR_COUNT', detail: 'bin locked for cycle count' };
  }
  if (candidate.expiresAt) {
    const expiresAt =
      candidate.expiresAt instanceof Date ? candidate.expiresAt : new Date(candidate.expiresAt);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return { ok: false, reason: 'EXPIRED', detail: `expired ${expiresAt.toISOString()}` };
    }
  }
  return { ok: true };
}

// ─── SQL builder (read path) ─────────────────────────────────────────────────

/** Returns a SQL WHERE-fragment string that filters a serial_units join to only pickable rows. */
export function pickableSerialUnitsWhereClause(): string {
  // ANY(ARRAY[...]) avoids ENUM::
  return [
    `su.current_status = 'STOCKED'::serial_status_enum`,
    `(loc.id IS NULL OR loc.locked_for_count = false)`,
    `(loc.id IS NULL OR COALESCE(loc.bin_role, 'RESERVE') NOT IN ('STAGING','DOCK','QUARANTINE','DAMAGED','RETURNS','RECEIVING'))`,
  ].join(' AND ');
}

/** Optional `LEFT JOIN` clause that the WHERE fragment expects. */
export function pickableSerialUnitsLeftJoin(): string {
  return 'LEFT JOIN locations loc ON loc.name = su.current_location';
}
