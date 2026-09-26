/** Work-session vocabulary — the shell's root discriminator. */

/** A session is one of exactly two kinds. */
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
type ScanSessionType = (typeof SCAN_SESSION_TYPES)[number];

function isScanSessionType(value: unknown): value is ScanSessionType {
  return typeof value === 'string' && (SCAN_SESSION_TYPES as readonly string[]).includes(value);
}

/** What a surface declares about the session it starts. */
type SurfaceSessionBinding =
  | { kind: 'scan'; scanType: ScanSessionType }
  | { kind: 'task' };

/** `work_sessions.status`. Mirrors work_sessions_status_chk. */
const SESSION_STATUSES = ['open', 'parked', 'ended'] as const;
type SessionStatus = (typeof SESSION_STATUSES)[number];

/** One `work_sessions` row, camel-cased. */
interface WorkSession {
  id: number;
  organizationId: string;
  kind: SessionKind;
  /** Non-null iff `kind === 'scan'` (DB CHECK enforces the iff). */
  scanType: ScanSessionType | null;
  /** True on at most ONE scan session per org (DB partial unique index). */
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

const WRAP_UP_SOURCES = ['staff', 'assistant'] as const;
type WrapUpSource = (typeof WRAP_UP_SOURCES)[number];

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

/** Uniform domain result — mapped straight onto HTTP by the route layer. */
type SessionResult<T> =
  | ({ ok: true; status: 200 } & T)
  | {
      ok: false;
      status: 400 | 404 | 409;
      error: string;
      /** On VERSION_CONFLICT: the version the row actually holds right now. */
      currentVersion?: number;
      /** On ARM_RACE_LOST: */
      armedSessionId?: number;
    };

/** The session audit vocabulary lives in `@/lib/audit-logs` (`AUDIT_ENTITY.WORK_SESSION`, `AUDIT_ACTION.WORK_SESSION_*`) with every other… */

// ── work_session_intervals ──────────────────────────────────────────────────

/** `work_session_intervals.kind`. */
const SESSION_INTERVAL_KINDS = ['active', 'parked'] as const;
type SessionIntervalKind = (typeof SESSION_INTERVAL_KINDS)[number];

/** One `work_session_intervals` row, camel-cased. */
interface WorkSessionInterval {
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
