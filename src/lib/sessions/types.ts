/**
 * Work-session vocabulary — the shell's root discriminator.
 *
 * DEPENDENCY-FREE ON PURPOSE. `SURFACE_REGISTRY` (src/lib/stations/
 * surface-keys.ts) imports from here, and that module is read by client
 * bundles. Nothing in this file may reach `@/lib/db`, `tenancy/db`, or any
 * other server-only graph (build-gotchas.md → bundle altitude). The domain
 * writer lives next door in `work-sessions.ts`, which does.
 *
 * Table: `work_sessions` (src/lib/migrations/2026-09-02_work_sessions.sql).
 * Spec: docs/warehouse-os/02-target-architecture.md §2.
 */

/**
 * A session is one of exactly two kinds. This two-value discriminator replaces
 * the seven competing "what kind of surface is this" vocabularies, and it is
 * the whole scan-ownership model:
 *
 *   'scan' → carries a scanType. At most ONE armed per staff (silent timekeeping).
 *   'task' → carries none.       N may be open at once.
 */
export const SESSION_KINDS = ['scan', 'task'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/**
 * The closed scan vocabulary. One entry per surface that puts a barcode in
 * front of an operator; `SURFACE_REGISTRY[key].session` is the only place these
 * are bound to a surface, so this list and that registry cannot drift.
 */
export const SCAN_SESSION_TYPES = [
  'unbox',
  'triage',
  'pickup',
  'test',
  'pack',
  'outbound',
] as const;
export type ScanSessionType = (typeof SCAN_SESSION_TYPES)[number];

export function isScanSessionType(value: unknown): value is ScanSessionType {
  return typeof value === 'string' && (SCAN_SESSION_TYPES as readonly string[]).includes(value);
}

/**
 * What a surface declares about the session it starts. REQUIRED on every
 * `SurfaceDefinition` with **no default**: the closed `Record<SurfaceKey, …>`
 * then makes the compiler enumerate every surface that has not answered, so a
 * new surface cannot inherit "task" (or "scan") by omission.
 *
 * The union shape is what keeps `scanType` honest — a task binding has no slot
 * to put one in, which is the type-level twin of the DB's
 * `work_sessions_scan_type_chk` iff.
 */
export type SurfaceSessionBinding =
  | { kind: 'scan'; scanType: ScanSessionType }
  | { kind: 'task' };

/** `work_sessions.status`. Mirrors work_sessions_status_chk. */
export const SESSION_STATUSES = ['open', 'parked', 'ended'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** One `work_sessions` row, camel-cased. */
export interface WorkSession {
  id: number;
  organizationId: string;
  kind: SessionKind;
  /** Non-null iff `kind === 'scan'` (DB CHECK enforces the iff). */
  scanType: ScanSessionType | null;
  /** True on at most ONE scan session per staff (DB partial unique index). */
  armed: boolean;
  /** `SURFACE_REGISTRY` key this session is doing the job of, if any. */
  surfaceKey: string | null;
  status: SessionStatus;
  /** Optimistic-concurrency counter; +1 per accepted mutation. */
  version: number;
  staffId: number | null;
  claimedByStaffId: number | null;
  claimExpiresAt: string | null;
  deviceId: string | null;
  clientEventId: string;
  startedAt: string;
  endedAt: string | null;
  state: Record<string, unknown>;
  /**
   * What the operator calls THIS block. Data, renameable, never an enum (S10,
   * K12). Seeded from the purpose label on system starts; required on custom
   * starts. Reporting must never GROUP BY this — A2.
   */
  title: string | null;
  /** L1 bucket. NULL = legacy row not yet backfilled. */
  purposeId: number | null;
  /** Running notes during the block. Not a clock. */
  notes: string | null;
  /** End-of-block recap (from → to, why). Duration is still Σ active. */
  wrapUp: string | null;
  /** Who wrote `wrapUp`. Physics, not vocabulary. */
  wrapUpSource: WrapUpSource | null;
}

export const WRAP_UP_SOURCES = ['staff', 'assistant'] as const;
export type WrapUpSource = (typeof WRAP_UP_SOURCES)[number];

/** One `work_session_purposes` row, camel-cased. */
export interface WorkSessionPurpose {
  id: number;
  organizationId: string;
  key: string;
  label: string;
  defaultSurfaceKey: string | null;
  defaultKind: SessionKind;
  isSystem: boolean;
  sortOrder: number;
  archivedAt: string | null;
}

/**
 * Uniform domain result — mapped straight onto HTTP by the route layer.
 *
 * THE FAILURE VARIANT CARRIES WHAT THE LOSER NEEDS TO RECONCILE. A bare 409
 * tells a client it lost without telling it to what, so the only recovery is a
 * guess or a full refetch — and on a floor network a guess is how two devices
 * end up ping-ponging the same session. Both extras are optional because they
 * are meaningful for exactly one error each.
 */
export type SessionResult<T> =
  | ({ ok: true; status: 200 } & T)
  | {
      ok: false;
      status: 400 | 404 | 409;
      error: string;
      /** On VERSION_CONFLICT: the version the row actually holds right now. */
      currentVersion?: number;
      /**
       * On ARM_RACE_LOST: the session that actually owns the wedge. Two devices
       * arming at once is normal, and the loser's next question is always
       * "then who has it" — answering it here is what keeps a lost race a
       * routine outcome instead of a 500.
       */
      armedSessionId?: number;
    };

/**
 * The session audit vocabulary lives in `@/lib/audit-logs`
 * (`AUDIT_ENTITY.WORK_SESSION`, `AUDIT_ACTION.WORK_SESSION_*`) with every other
 * audit constant — dashboards key off those maps, so a second home for the same
 * values is a drift surface. It is NOT re-exported here: this module is
 * dependency-free by contract (see the file docblock) and its client consumers
 * have no business reaching the audit vocabulary.
 */

// ── work_session_intervals ──────────────────────────────────────────────────

/**
 * `work_session_intervals.kind`. Mirrors work_session_intervals_kind_chk
 * (src/lib/migrations/2026-09-02_work_sessions.sql).
 *
 * The two kinds TILE a session's wall clock: at any instant between
 * `started_at` and `ended_at` the session is in exactly one of them. That is
 * why 'active' rows are written explicitly rather than inferred as "the holes
 * between parks" — an active row is what carries the `staffId` of whoever
 * worked that particular stretch.
 *
 * NOT the same fact as `SessionStatus`. `status` is where the session is NOW;
 * these are where it has BEEN. An open session still has parked intervals from
 * an hour ago.
 */
export const SESSION_INTERVAL_KINDS = ['active', 'parked'] as const;
export type SessionIntervalKind = (typeof SESSION_INTERVAL_KINDS)[number];

/** One `work_session_intervals` row, camel-cased. */
export interface WorkSessionInterval {
  id: number;
  organizationId: string;
  sessionId: number;
  kind: SessionIntervalKind;
  /** DB clock. Never a client timestamp — see session-metrics.ts §clocks. */
  startedAt: string;
  /** NULL = the session is in this interval right now. At most one per session. */
  endedAt: string | null;
  /**
   * Who worked THIS stretch. Denormalized from the parent on purpose: a lead
   * resuming someone else's parked session makes the next stretch theirs, and
   * `WorkSession.staffId` cannot hold two answers.
   */
  staffId: number | null;
}
