/**
 * work_sessions — the domain writer for the shell's root object.
 *
 * Table + rationale: src/lib/migrations/2026-08-22b_work_sessions.sql.
 * Vocabulary: ./types.ts (dependency-free; safe for client bundles).
 *
 * THE ONE-ARMED-SCAN RULE IS NOT IMPLEMENTED HERE. It is a partial unique
 * index — `ux_work_sessions_armed_scan ON work_sessions (organization_id)
 * WHERE kind = 'scan' AND armed = true`. This module's job is only to make the
 * SWAP atomic and well-ordered: `armScanSession` disarms every other armed scan
 * session and arms the target as two statements inside ONE transaction, so the
 * non-deferrable index never sees a transient second armer. If this code is
 * wrong, the write fails loudly; it cannot produce two armed sessions.
 *
 * Every function is org-scoped through `withTenantTransaction` (GUC + RLS) and
 * takes `orgId` as a required argument — from `ctx.organizationId` at the route,
 * never from a request body.
 *
 * Collaborators are injected (real impls by default) so the whole module is
 * unit-testable with zero DB — same shape as `applyTransition` /`advanceItem`.
 * See work-sessions.test.ts.
 */

import { safeRandomUUID } from '@/lib/safe-uuid';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  isScanSessionType,
  type ScanSessionType,
  type SessionIntervalKind,
  type SessionKind,
  type SessionResult,
  type WorkSession,
} from './types';

/** The narrow slice of a pg client this module uses (fakes implement 3 lines). */
export interface SessionQueryable {
  query: (
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

/** Injectable collaborators — real impls by default, fakes in tests. */
export interface WorkSessionDeps {
  withTenantTransaction: <T>(
    orgId: OrgId,
    fn: (db: SessionQueryable) => Promise<T>,
  ) => Promise<T>;
  /** Minted when the caller does not supply one (idempotency anchor). */
  newClientEventId: () => string;
}

export const defaultWorkSessionDeps: WorkSessionDeps = {
  // Resolved LAZILY. `@/lib/tenancy/db` reaches `@/lib/db`, which carries
  // `import 'server-only'` — a static import here puts that in this module's
  // graph, and the whole point of the deps object is that `work-sessions.test.ts`
  // can import these functions with zero DB. It could not: the throw fires at
  // module load, before a single fake is installed. Server callers pay one
  // already-cached dynamic import on the first transaction.
  withTenantTransaction: async (orgId, fn) => {
    const { withTenantTransaction } = await import('@/lib/tenancy/db');
    return withTenantTransaction(orgId, (client) => fn(client));
  },
  newClientEventId: safeRandomUUID,
};

/**
 * How long an edit lease holds before another operator may take the session
 * over. This is a LEASE on who is editing — NOT a session TTL. Sessions are
 * persistent (D8): nothing here ever ends a mounted shell.
 */
export const DEFAULT_CLAIM_TTL_SECONDS = 900;

const COLUMNS = `
  id, organization_id, kind, scan_type, armed, surface_key, status, version,
  staff_id, claimed_by_staff_id, claim_expires_at, device_id, client_event_id,
  started_at, ended_at, state
`;

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** One row → the camel-cased domain shape. The ONLY mapper in this module. */
export function mapWorkSession(row: Record<string, unknown>): WorkSession {
  return {
    id: Number(row.id),
    organizationId: String(row.organization_id),
    kind: row.kind as SessionKind,
    scanType: (row.scan_type as ScanSessionType | null) ?? null,
    armed: row.armed === true,
    surfaceKey: (row.surface_key as string | null) ?? null,
    status: row.status as WorkSession['status'],
    version: Number(row.version),
    staffId: row.staff_id == null ? null : Number(row.staff_id),
    claimedByStaffId: row.claimed_by_staff_id == null ? null : Number(row.claimed_by_staff_id),
    claimExpiresAt: toIso(row.claim_expires_at),
    deviceId: (row.device_id as string | null) ?? null,
    clientEventId: String(row.client_event_id),
    startedAt: toIso(row.started_at) ?? '',
    endedAt: toIso(row.ended_at),
    state: (row.state as Record<string, unknown> | null) ?? {},
  };
}

async function selectForUpdate(
  db: SessionQueryable,
  orgId: OrgId,
  sessionId: number,
): Promise<WorkSession | null> {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM work_sessions
      WHERE organization_id = $1 AND id = $2
      FOR UPDATE`,
    [orgId, sessionId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapWorkSession(row) : null;
}

/** Optimistic-concurrency gate. `undefined` = caller is not asserting a version. */
function versionConflict(session: WorkSession, expectedVersion?: number): boolean {
  return expectedVersion != null && session.version !== expectedVersion;
}

// ── start ───────────────────────────────────────────────────────────────────

interface StartSessionCommon {
  /** From `ctx.organizationId`. Never the request body. */
  orgId: OrgId;
  /** `SURFACE_REGISTRY` key this session does the job of. */
  surfaceKey?: string | null;
  staffId?: number | null;
  deviceId?: string | null;
  /** Retry-safe anchor. Re-posting the same id returns the same row. */
  clientEventId?: string | null;
  state?: Record<string, unknown>;
}

/**
 * A DISCRIMINATED UNION, not a flat bag with an optional `scanType`.
 *
 * This is the third statement of the same iff: `work_sessions_scan_type_chk`
 * says it in SQL, `SurfaceSessionBinding` says it in the registry, and this
 * says it at every internal call site — a task session has nowhere to PUT a
 * scanType, and a scan session cannot omit one. The runtime guard below stays
 * anyway, because a JSON body cast through this type is a lie TS cannot see.
 */
export type StartSessionArgs =
  | (StartSessionCommon & {
      kind: 'scan';
      scanType: ScanSessionType;
      /** Arm the session in the same transaction that creates it. */
      arm?: boolean;
    })
  | (StartSessionCommon & { kind: 'task'; scanType?: never; arm?: never });

export type StartSessionResult = SessionResult<{
  session: WorkSession;
  /** true when this client_event_id had already created the session. */
  idempotent: boolean;
  /** Scan sessions this start disarmed (only when `arm` was set). */
  disarmedSessionIds: number[];
  /**
   * Set when `arm` was requested and the database's one-armed index refused —
   * another device won. The session is still created and returned; this names
   * who holds the wedge instead. `null` on every other path.
   */
  armRaceLostTo: number | null;
}>;

export async function startSession(
  args: StartSessionArgs,
  deps: WorkSessionDeps = defaultWorkSessionDeps,
): Promise<StartSessionResult> {
  // Read both fields off the RAW object, not through the narrowed union — a
  // caller that cast an untrusted body into this type must still be caught.
  const scanType = (args as { scanType?: ScanSessionType | null }).scanType ?? null;
  const wantsArm = (args as { arm?: boolean }).arm === true;

  const kindError = validateKind(args.kind, scanType);
  if (kindError) return { ok: false, status: 400, error: kindError };
  if (wantsArm && args.kind !== 'scan') {
    return { ok: false, status: 400, error: 'ARM_REQUIRES_SCAN_KIND' };
  }

  const clientEventId = args.clientEventId ?? deps.newClientEventId();

  return deps.withTenantTransaction(args.orgId, async (db) => {
    // Idempotent create: a retried POST lands on the same row rather than a
    // second session (ux_work_sessions_client_event).
    const inserted = await db.query(
      `INSERT INTO work_sessions
         (organization_id, kind, scan_type, surface_key, staff_id, device_id,
          client_event_id, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (organization_id, client_event_id) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        args.orgId,
        args.kind,
        scanType,
        args.surfaceKey ?? null,
        args.staffId ?? null,
        args.deviceId ?? null,
        clientEventId,
        JSON.stringify(args.state ?? {}),
      ],
    );

    let session = (inserted.rows[0] as Record<string, unknown> | undefined)
      ? mapWorkSession(inserted.rows[0] as Record<string, unknown>)
      : null;
    let idempotent = false;

    if (!session) {
      const existing = await db.query(
        `SELECT ${COLUMNS} FROM work_sessions
          WHERE organization_id = $1 AND client_event_id = $2`,
        [args.orgId, clientEventId],
      );
      const row = existing.rows[0] as Record<string, unknown> | undefined;
      if (!row) return { ok: false, status: 409, error: 'SESSION_CREATE_LOST' } as const;
      session = mapWorkSession(row);
      idempotent = true;
    }

    // The session's first stretch. Opened ONLY on a real create: a replayed
    // start must not fabricate a second active interval, which would trip
    // ux_work_session_intervals_open and turn a harmless retry into a 500.
    if (!idempotent) {
      await openInterval(db, args.orgId, session.id, 'active', args.staffId ?? null);
    }

    if (!wantsArm || session.armed) {
      return {
        ok: true, status: 200, session, idempotent, disarmedSessionIds: [], armRaceLostTo: null,
      } as const;
    }

    const armed = await armWithin(db, args.orgId, session);
    if (!armed.won) {
      // The session EXISTS and is usable — only the wedge went elsewhere. A 409
      // here would make the client re-POST to get back a row it already has,
      // over a floor network, for a case that is not an error. Report who won
      // instead; the shell shows "Unbox is armed at Station 3" and the operator
      // knows where their next scan lands.
      return {
        ok: true,
        status: 200,
        session,
        idempotent,
        disarmedSessionIds: [],
        armRaceLostTo: armed.armedSessionId,
      } as const;
    }
    return {
      ok: true,
      status: 200,
      session: armed.session,
      idempotent,
      disarmedSessionIds: armed.disarmedSessionIds,
      armRaceLostTo: null,
    } as const;
  });
}

function validateKind(kind: SessionKind, scanType: ScanSessionType | null): string | null {
  if (kind === 'scan') {
    if (!scanType) return 'SCAN_SESSION_REQUIRES_SCAN_TYPE';
    if (!isScanSessionType(scanType)) return 'UNKNOWN_SCAN_TYPE';
    return null;
  }
  if (kind === 'task') {
    // The type-level twin of work_sessions_scan_type_chk: a task session
    // carrying a scanType is a corruption, not a harmless extra.
    if (scanType) return 'TASK_SESSION_MUST_NOT_CARRY_SCAN_TYPE';
    return null;
  }
  return 'UNKNOWN_SESSION_KIND';
}

// ── arm ─────────────────────────────────────────────────────────────────────

/**
 * The swap, inside a caller-owned transaction.
 *
 * TWO STATEMENTS, DISARM FIRST. A single UPDATE that flipped both rows could
 * trip `ux_work_sessions_armed_scan` mid-statement (the index is not
 * deferrable, and row order within one UPDATE is not ours to choose). Split and
 * ordered, the tenant is momentarily left with zero armed scan sessions — never
 * two — and the whole swap commits or rolls back as one.
 */
/**
 * True for a `ux_work_sessions_armed_scan` violation — the arm race, lost.
 *
 * Matched on SQLSTATE 23505 plus the index name rather than on the message
 * text, which is locale- and version-dependent. Any OTHER unique violation is
 * deliberately not swallowed: it is a bug, and turning every 23505 into a
 * routine 409 would hide it.
 */
function isArmRaceViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code !== '23505') return false;
  return (
    e.constraint === 'ux_work_sessions_armed_scan' ||
    String(e.message ?? '').includes('ux_work_sessions_armed_scan')
  );
}

type ArmOutcome =
  | { won: true; session: WorkSession; disarmedSessionIds: number[] }
  /** The index rejected the swap. `armedSessionId` is whoever actually has it. */
  | { won: false; armedSessionId: number | null };

async function armWithin(
  db: SessionQueryable,
  orgId: OrgId,
  target: WorkSession,
): Promise<ArmOutcome> {
  // SAVEPOINT, because a lost race must not poison the caller's transaction.
  // A 23505 inside a transaction puts it in the aborted state (25P02): every
  // later statement fails and the final COMMIT silently degrades to ROLLBACK —
  // which, in startSession, would throw away the session row we had just
  // created. Rolling back to the savepoint contains the failure to the swap.
  // Same shape as recordEntitySignal's `entity_signal_emit` guard.
  await db.query('SAVEPOINT arm_swap');
  try {
    const disarmed = await db.query(
      `UPDATE work_sessions
          SET armed = false, version = version + 1, updated_at = now()
        WHERE organization_id = $1
          AND kind = 'scan'
          AND armed = true
          AND id <> $2
        RETURNING id`,
      [orgId, target.id],
    );

    const armed = await db.query(
      `UPDATE work_sessions
          SET armed = true, version = version + 1, updated_at = now()
        WHERE organization_id = $1 AND id = $2
        RETURNING ${COLUMNS}`,
      [orgId, target.id],
    );

    await db.query('RELEASE SAVEPOINT arm_swap');
    return {
      won: true,
      session: mapWorkSession(armed.rows[0] as Record<string, unknown>),
      disarmedSessionIds: (disarmed.rows as Array<Record<string, unknown>>).map((r) =>
        Number(r.id),
      ),
    };
  } catch (err) {
    if (!isArmRaceViolation(err)) throw err;
    await db.query('ROLLBACK TO SAVEPOINT arm_swap');
    // Re-read rather than guess. By the time the loser asks, the winner is a
    // committed fact, and "who owns the wedge" is the only thing the operator
    // wants to know.
    const { rows } = await db.query(
      `SELECT id FROM work_sessions
        WHERE organization_id = $1 AND kind = 'scan' AND armed = true`,
      [orgId],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    return { won: false, armedSessionId: row ? Number(row.id) : null };
  }
}

export interface ArmScanSessionArgs {
  orgId: OrgId;
  sessionId: number;
  /** Reject if the session drifted from this version (optimistic concurrency). */
  expectedVersion?: number;
}

export type ArmScanSessionResult = SessionResult<{
  session: WorkSession;
  /** The sessions this arm took the wedge away from. */
  disarmedSessionIds: number[];
  /** true when the session already held the arm (re-arm is a no-op). */
  idempotent: boolean;
}>;

export async function armScanSession(
  args: ArmScanSessionArgs,
  deps: WorkSessionDeps = defaultWorkSessionDeps,
): Promise<ArmScanSessionResult> {
  return deps.withTenantTransaction(args.orgId, async (db) => {
    const session = await selectForUpdate(db, args.orgId, args.sessionId);
    if (!session) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' } as const;
    if (session.kind !== 'scan') {
      return { ok: false, status: 409, error: 'ONLY_A_SCAN_SESSION_CAN_ARM' } as const;
    }
    if (session.status !== 'open') {
      return { ok: false, status: 409, error: `CANNOT_ARM_${session.status.toUpperCase()}_SESSION` } as const;
    }
    if (versionConflict(session, args.expectedVersion)) {
      return { ok: false, status: 409, error: 'VERSION_CONFLICT', currentVersion: session.version } as const;
    }
    if (session.armed) {
      return {
        ok: true, status: 200, session, disarmedSessionIds: [], idempotent: true,
      } as const;
    }

    const armed = await armWithin(db, args.orgId, session);
    if (!armed.won) {
      // Unlike startSession, this WAS the operator's explicit act — they asked
      // for the wedge and did not get it, so it is a 409. Carrying the winner's
      // id is what lets the client reconcile instead of retrying blindly.
      return {
        ok: false,
        status: 409,
        error: 'ARM_RACE_LOST',
        armedSessionId: armed.armedSessionId ?? undefined,
      } as const;
    }
    return {
      ok: true,
      status: 200,
      session: armed.session,
      disarmedSessionIds: armed.disarmedSessionIds,
      idempotent: false,
    } as const;
  });
}

// ── read ────────────────────────────────────────────────────────────────────

/**
 * The wedge's owner. At most one row can satisfy this predicate per tenant —
 * that is the index, not a `LIMIT 1` hiding a race.
 */
export async function getArmedScanSession(
  args: { orgId: OrgId },
  deps: WorkSessionDeps = defaultWorkSessionDeps,
): Promise<WorkSession | null> {
  return deps.withTenantTransaction(args.orgId, async (db) => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM work_sessions
        WHERE organization_id = $1 AND kind = 'scan' AND armed = true`,
      [args.orgId],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    return row ? mapWorkSession(row) : null;
  });
}

// ── intervals ───────────────────────────────────────────────────────────────

/**
 * `work_session_intervals` — the stretches this session was worked, and the
 * stretches it sat parked. Table + rationale:
 * src/lib/migrations/2026-08-23e_work_session_intervals.sql.
 *
 * PARKED TIME IS NOT WORK TIME, and before these rows existed `park()` flipped
 * a status and lost when it happened. A session parks many times, so there is
 * no pair of timestamp columns that can hold the answer — the duration is a
 * fold over rows (./session-metrics.ts), never a counter some writer has to
 * keep true.
 *
 * CLOSE BEFORE OPEN, always, as two ordered statements inside the caller's
 * transaction. `ux_work_session_intervals_open` is a partial unique index over
 * `session_id WHERE ended_at IS NULL` and it is not deferrable — opening the
 * next stretch before closing the last one trips it mid-transaction. Same
 * shape, and same reason, as disarm-before-arm in {@link armWithin}.
 *
 * Every timestamp here is `now()` — the DB clock. A client timestamp would make
 * two benches disagree about how long a session took, and a handheld running
 * fast would produce negative parked time.
 */
interface OpenInterval {
  id: number;
  kind: SessionIntervalKind;
  staffId: number | null;
}

async function readOpenInterval(
  db: SessionQueryable,
  orgId: OrgId,
  sessionId: number,
): Promise<OpenInterval | null> {
  const { rows } = await db.query(
    `SELECT id, kind, staff_id FROM work_session_intervals
      WHERE organization_id = $1 AND session_id = $2 AND ended_at IS NULL
      FOR UPDATE`,
    [orgId, sessionId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    kind: row.kind as SessionIntervalKind,
    staffId: row.staff_id == null ? null : Number(row.staff_id),
  };
}

/** Close whatever stretch is open. No-op when none is. */
async function closeOpenInterval(
  db: SessionQueryable,
  orgId: OrgId,
  sessionId: number,
): Promise<void> {
  await db.query(
    `UPDATE work_session_intervals
        SET ended_at = now()
      WHERE organization_id = $1 AND session_id = $2 AND ended_at IS NULL`,
    [orgId, sessionId],
  );
}

/**
 * Begin a stretch.
 *
 * `staffId` is who is working THIS stretch — not necessarily who owns the
 * session. A lead resuming someone else's parked session opens an active
 * interval in their own name, which is the only way a report can credit each
 * stretch to the person who actually did it. On a parked stretch it records who
 * left it parked; that row is never summed as work time, because the fold keys
 * on `kind`.
 */
async function openInterval(
  db: SessionQueryable,
  orgId: OrgId,
  sessionId: number,
  kind: SessionIntervalKind,
  staffId: number | null,
): Promise<void> {
  await db.query(
    `INSERT INTO work_session_intervals
       (organization_id, session_id, kind, started_at, staff_id)
     VALUES ($1, $2, $3, now(), $4)`,
    [orgId, sessionId, kind, staffId],
  );
}

// ── park / resume / end ─────────────────────────────────────────────────────

export interface ParkSessionArgs {
  orgId: OrgId;
  sessionId: number;
  /**
   * Who is parking it. Recorded on the parked interval so the trail says who
   * left the session set aside. Never summed as work time — the duration fold
   * keys on the interval's `kind`, not its staff.
   */
  staffId?: number | null;
  expectedVersion?: number;
}

export type ParkSessionResult = SessionResult<{ session: WorkSession; idempotent: boolean }>;

/**
 * Set a session aside without ending it. Parking DISARMS — the arm belongs to
 * live work, and `work_sessions_armed_chk` refuses a parked armed row anyway.
 */
export async function parkSession(
  args: ParkSessionArgs,
  deps: WorkSessionDeps = defaultWorkSessionDeps,
): Promise<ParkSessionResult> {
  return deps.withTenantTransaction(args.orgId, async (db) => {
    const session = await selectForUpdate(db, args.orgId, args.sessionId);
    if (!session) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' } as const;
    if (session.status === 'ended') {
      return { ok: false, status: 409, error: 'SESSION_ALREADY_ENDED' } as const;
    }
    if (versionConflict(session, args.expectedVersion)) {
      return { ok: false, status: 409, error: 'VERSION_CONFLICT', currentVersion: session.version } as const;
    }
    if (session.status === 'parked') {
      return { ok: true, status: 200, session, idempotent: true } as const;
    }

    // Close the stretch that was being worked before opening the parked one —
    // ux_work_session_intervals_open is not deferrable. The parker inherits the
    // closed stretch's staff when the caller did not name one, so a park with no
    // actor still attributes to whoever was working.
    const open = await readOpenInterval(db, args.orgId, args.sessionId);
    await closeOpenInterval(db, args.orgId, args.sessionId);
    await openInterval(
      db,
      args.orgId,
      args.sessionId,
      'parked',
      args.staffId ?? open?.staffId ?? null,
    );

    const { rows } = await db.query(
      `UPDATE work_sessions
          SET status = 'parked', armed = false, version = version + 1, updated_at = now()
        WHERE organization_id = $1 AND id = $2
        RETURNING ${COLUMNS}`,
      [args.orgId, args.sessionId],
    );
    return {
      ok: true,
      status: 200,
      session: mapWorkSession(rows[0] as Record<string, unknown>),
      idempotent: false,
    } as const;
  });
}

export interface ResumeSessionArgs {
  orgId: OrgId;
  sessionId: number;
  /** Who is taking the lease. */
  staffId?: number | null;
  deviceId?: string | null;
  claimTtlSeconds?: number;
  expectedVersion?: number;
}

export type ResumeSessionResult = SessionResult<{ session: WorkSession }>;

/**
 * Reopen a parked session, or renew/take over the edit lease on an open one.
 *
 * Resuming a SCAN session deliberately does NOT arm it. Arming moves the wedge
 * app-wide, and a resume that silently stole every scan from the operator
 * actually working would be the exact mount-order surprise the one-armed rule
 * exists to delete. Call `armScanSession` next, as its own act.
 */
export async function resumeSession(
  args: ResumeSessionArgs,
  deps: WorkSessionDeps = defaultWorkSessionDeps,
): Promise<ResumeSessionResult> {
  const ttl = args.claimTtlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS;

  return deps.withTenantTransaction(args.orgId, async (db) => {
    const session = await selectForUpdate(db, args.orgId, args.sessionId);
    if (!session) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' } as const;
    if (session.status === 'ended') {
      return { ok: false, status: 409, error: 'SESSION_ALREADY_ENDED' } as const;
    }
    if (versionConflict(session, args.expectedVersion)) {
      return { ok: false, status: 409, error: 'VERSION_CONFLICT', currentVersion: session.version } as const;
    }

    // A resume changes WHO is working the session as often as it changes
    // WHETHER anyone is. Three cases, and only the first two open a stretch:
    //
    //   parked → open              : the park ends, a new active stretch begins;
    //   open, different staffer    : a HANDOVER. The previous stretch belongs to
    //                                the previous person and must be closed, or
    //                                the whole session's time would be credited
    //                                to whoever happened to touch it last;
    //   open, same staffer         : a lease RENEWAL. Churning the interval here
    //                                would shred one stretch of work into a row
    //                                per heartbeat.
    const open = await readOpenInterval(db, args.orgId, args.sessionId);
    const resumer = args.staffId ?? null;
    const handover = open != null && open.kind === 'active' && open.staffId !== resumer;
    if (open == null || open.kind === 'parked' || handover) {
      await closeOpenInterval(db, args.orgId, args.sessionId);
      await openInterval(db, args.orgId, args.sessionId, 'active', resumer);
    }

    const { rows } = await db.query(
      `UPDATE work_sessions
          SET status = 'open',
              claimed_by_staff_id = $3,
              claim_expires_at = now() + ($4::int * interval '1 second'),
              device_id = COALESCE($5, device_id),
              version = version + 1,
              updated_at = now()
        WHERE organization_id = $1 AND id = $2
        RETURNING ${COLUMNS}`,
      [args.orgId, args.sessionId, args.staffId ?? null, ttl, args.deviceId ?? null],
    );
    return { ok: true, status: 200, session: mapWorkSession(rows[0] as Record<string, unknown>) } as const;
  });
}

export interface EndSessionArgs {
  orgId: OrgId;
  sessionId: number;
  expectedVersion?: number;
}

export type EndSessionResult = SessionResult<{ session: WorkSession; idempotent: boolean }>;

/** End a session. Always disarms — an ended session cannot own the wedge. */
export async function endSession(
  args: EndSessionArgs,
  deps: WorkSessionDeps = defaultWorkSessionDeps,
): Promise<EndSessionResult> {
  return deps.withTenantTransaction(args.orgId, async (db) => {
    const session = await selectForUpdate(db, args.orgId, args.sessionId);
    if (!session) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' } as const;
    if (versionConflict(session, args.expectedVersion)) {
      return { ok: false, status: 409, error: 'VERSION_CONFLICT', currentVersion: session.version } as const;
    }
    if (session.status === 'ended') {
      // Re-ending is a retry, not an error.
      return { ok: true, status: 200, session, idempotent: true } as const;
    }

    // Close whatever stretch is open — active or parked. No stretch is opened:
    // an ended session has no "now", and a dangling open interval would make
    // every later duration read grow forever against `dbNow`.
    await closeOpenInterval(db, args.orgId, args.sessionId);

    const { rows } = await db.query(
      `UPDATE work_sessions
          SET status = 'ended', armed = false, ended_at = now(),
              claimed_by_staff_id = NULL, claim_expires_at = NULL,
              version = version + 1, updated_at = now()
        WHERE organization_id = $1 AND id = $2
        RETURNING ${COLUMNS}`,
      [args.orgId, args.sessionId],
    );
    return {
      ok: true,
      status: 200,
      session: mapWorkSession(rows[0] as Record<string, unknown>),
      idempotent: false,
    } as const;
  });
}
