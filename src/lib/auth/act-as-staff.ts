/**
 * "Act as staff" authorization — the pure decision behind POST /api/auth/act-as-staff.
 *
 * The SHARED-account avenue (see settings `staffLoginModel = 'shared'`): on a
 * shared workspace, an already-signed-in session (reached via the shared
 * email+password) may mint a session for ANY active staff in the SAME org with
 * NO PIN. The shared login is the entry gate; this helper enforces the two
 * invariants that keep it from becoming a cross-tenant or per-email-org hole:
 *   1. the caller's org must actually be a shared-account workspace, and
 *   2. the target staff must be an active member of that SAME org.
 *
 * Kept DB-free + Deps-free so it unit-tests with zero database (see
 * act-as-staff.test.ts). The route supplies the three facts it needs.
 */

export type ActAsError =
  | 'NOT_SHARED_ORG'    // caller's org isn't a shared-account workspace
  | 'TARGET_NOT_FOUND'  // no such staff id
  | 'CROSS_ORG'         // target belongs to a different org than the caller
  | 'TARGET_INACTIVE'   // target staff is deactivated
  | 'TARGET_EXCEEDS_CALLER'; // target holds a permission the caller lacks (ceiling, 2026-09-06)

export type ActAsDecision = { ok: true } | { ok: false; error: ActAsError };

export interface ActAsTarget {
  /** The org the target staff row belongs to. */
  orgId: string;
  /** COALESCE(active, true) for the target staff. */
  active: boolean;
}

/**
 * Decide whether `callerOrgId` (an authenticated session's org) may act as the
 * given target staff. First failing invariant wins; order is chosen so a
 * non-shared (per-email) org never even reveals whether a staff id exists.
 *
 * Permission ceiling (added 2026-09-06, operator-approved): when both
 * effective permission sets are supplied, every permission the TARGET holds
 * must also be held by the CALLER — acting as someone may never grant a
 * permission the caller does not already have. An admin caller holds the full
 * registry (computeEffectivePermissions short-circuit) so the ceiling is
 * invisible to them. Inputs stay optional so the pure-decision unit tests
 * need no DB.
 */
export function evaluateActAs(input: {
  sharedAccountEnabled: boolean;
  callerOrgId: string;
  target: ActAsTarget | null;
  callerPermissions?: ReadonlySet<string>;
  targetPermissions?: ReadonlySet<string>;
}): ActAsDecision {
  if (!input.sharedAccountEnabled) return { ok: false, error: 'NOT_SHARED_ORG' };
  if (!input.target) return { ok: false, error: 'TARGET_NOT_FOUND' };
  if (input.target.orgId !== input.callerOrgId) return { ok: false, error: 'CROSS_ORG' };
  if (!input.target.active) return { ok: false, error: 'TARGET_INACTIVE' };
  if (input.callerPermissions && input.targetPermissions) {
    for (const perm of input.targetPermissions) {
      if (!input.callerPermissions.has(perm)) return { ok: false, error: 'TARGET_EXCEEDS_CALLER' };
    }
  }
  return { ok: true };
}

/** HTTP status for each denial reason (CROSS_ORG masquerades as 404, not 403,
 *  so a shared org can't probe another tenant's staff ids). */
export function actAsErrorStatus(error: ActAsError): number {
  switch (error) {
    case 'TARGET_NOT_FOUND':
    case 'CROSS_ORG':
      return 404;
    case 'NOT_SHARED_ORG':
    case 'TARGET_INACTIVE':
    case 'TARGET_EXCEEDS_CALLER':
      return 403;
  }
}

