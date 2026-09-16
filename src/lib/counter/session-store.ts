/**
 * Counter session store — the ONE domain module both doors call.
 *
 * `/api/counter/session/**` mounts two auth wrappers over this module:
 * `withAuth` for the desk and `withKioskAuth` for the tablet. They answer two
 * different questions and must not be confused:
 *
 *   - the ROUTE answers "does this staffer hold `walk_in.intake`?"
 *   - THIS MODULE answers "may a device principal do this at all?" (plan D5)
 *
 * Putting D5 in the routes would mean re-deciding it in nine files, and the
 * tenth would get it wrong. Every mutation here takes an `actor`, and a
 * `kiosk` actor is refused for every line write — add, update, void, price —
 * leaving the tablet four verbs: set customer, sign, confirm, and consult stance.
 *
 * ### Concurrency is the version predicate, not a lock
 *
 * Every mutation ends in
 *   `UPDATE counter_sessions SET version = version + 1 WHERE … AND version = $expected`
 * inside the same transaction as the write it accompanies. A concurrent
 * mutation has already moved `version`, so the conditional update matches zero
 * rows and this caller gets `VERSION_CONFLICT` **with the current snapshot** —
 * which is also what makes the read-then-write above it safe without
 * `FOR UPDATE`. The client re-renders from the returned snapshot rather than
 * retrying blind (plan D3).
 *
 * A successful mutation returns the `CounterSessionEvent` it produced, so the
 * caller publishes exactly what a subscriber can apply at `version + 1`
 * (`applySessionEvent`) instead of forcing everyone to refetch.
 *
 * `Deps` is injectable (defaulting to the real DB-backed impls) so the whole
 * verb set is unit-tested with zero DB — the house pattern from
 * `backend-patterns.md`.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P2 · D1 · D3 · D4 · D5 · D6 · D8).
 */

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { KioskCartLine, KioskLinePayload } from '@/lib/kiosk/cart-line';
import { isRepairPayload } from '@/lib/kiosk/cart-line';
import { submitBlocker } from './submit-blocker';
import { mapKioskCartToCounterParts } from '@/lib/kiosk/cart-to-counter';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { submitCounterTransaction } from './submit-counter-transaction';
import { createTerminalCheckout } from './terminal-checkout';
import type { CounterTransactionResult } from './counter-transaction-types';
import { KIOSK_FALLBACK_COMMAND, type KioskCommandId } from '@/lib/kiosk/commands';
import {
  emptySessionSnapshot,
  isTerminalPaymentOutcome,
  type CounterPaymentState,
  type CounterSessionCustomer,
  type CounterSessionEvent,
  type CounterSessionFace,
  type CounterSessionLine,
  type CounterSessionSnapshot,
  type CounterSessionStatus,
} from './session-events';
import {
  consultStanceFromFace,
  faceFromConsultStance,
  parseConsultPresentation,
  type ConsultPresentation,
  type ConsultStance,
} from './consult-stance';

// ── Actor + result vocabulary ───────────────────────────────────────────────

/**
 * Who is asking. NOT an authorization input on its own — the route has already
 * proven the principal; this decides which DOOR's rules apply (D5).
 */
export type CounterSessionActor =
  | { kind: 'desk'; staffId: number }
  | { kind: 'kiosk'; deviceId: number };

export type CounterSessionError =
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'SESSION_CLOSED'
  | 'DEVICE_FORBIDDEN'
  | 'NOT_CLAIMED'
  | 'CLAIMED_BY_OTHER'
  | 'DEVICE_BUSY'
  | 'LINE_NOT_FOUND'
  | 'LINE_NOT_REPAIR'
  | 'EMPTY_CART'
  | 'UNSIGNED_REPAIR'
  | 'MISSING_CUSTOMER'
  | 'SUBMIT_REJECTED'
  | 'NOT_SUBMITTED'
  | 'NO_STAGED_ORDER'
  | 'ALREADY_AWAITING_CARD'
  | 'TERMINAL_REFUSED';

export type CounterSessionResult =
  | { ok: true; snapshot: CounterSessionSnapshot; event: CounterSessionEvent }
  | { ok: false; code: CounterSessionError; snapshot: CounterSessionSnapshot | null };

/** HTTP status for each refusal. One map, so nine routes cannot disagree. */
export const COUNTER_SESSION_ERROR_STATUS: Record<CounterSessionError, number> = {
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  SESSION_CLOSED: 409,
  DEVICE_FORBIDDEN: 403,
  NOT_CLAIMED: 409,
  CLAIMED_BY_OTHER: 409,
  DEVICE_BUSY: 409,
  LINE_NOT_FOUND: 404,
  LINE_NOT_REPAIR: 422,
  // 422 across the submit gates: the request is well-formed and authorized, the
  // VISIT is not finishable yet. A 400 would read as "you sent it wrong".
  EMPTY_CART: 422,
  UNSIGNED_REPAIR: 422,
  MISSING_CUSTOMER: 422,
  SUBMIT_REJECTED: 422,
  // Card-present gates (SQ2).
  NOT_SUBMITTED: 409,
  NO_STAGED_ORDER: 422,
  ALREADY_AWAITING_CARD: 409,
  // 502: the request was fine, the payment provider refused it.
  TERMINAL_REFUSED: 502,
};

/** Default lease: long enough to serve one customer, short enough to recover. */
export const DEFAULT_CLAIM_LEASE_MS = 5 * 60 * 1000;

// ── Deps ────────────────────────────────────────────────────────────────────

/** Opaque transaction handle — a `PoolClient` in production, anything in tests. */
export type CounterSessionTx = PoolClient | { readonly __fake: true };

export interface NewLineInput {
  lineUuid: string;
  type: KioskCartLine['type'];
  title: string;
  quantity: number;
  unitAmountCents: number;
  payload: KioskLinePayload;
  sortIndex: number;
}

export interface LinePatch {
  title?: string;
  quantity?: number;
  unitAmountCents?: number;
  payload?: KioskLinePayload;
  voidedAtMs?: number;
  voidReason?: string | null;
  voidedByStaffId?: number | null;
}

export interface HeaderPatch {
  paymentState?: CounterPaymentState;
  terminalCheckoutId?: string | null;
  awaitingCardSinceMs?: number | null;
  counterTransactionId?: number | null;
  submittedAtMs?: number | null;
  kioskDeviceId?: number | null;
  claimedByStaffId?: number | null;
  claimExpiresAtMs?: number | null;
  status?: CounterSessionStatus;
  activeCommand?: KioskCommandId;
  face?: CounterSessionFace;
  consultStance?: ConsultStance;
  presentation?: ConsultPresentation;
  customer?: CounterSessionCustomer;
}

export interface CounterSessionDeps {
  runInTransaction<T>(orgId: OrgId, fn: (tx: CounterSessionTx) => Promise<T>): Promise<T>;
  readSnapshot(tx: CounterSessionTx, orgId: OrgId, sessionId: number): Promise<CounterSessionSnapshot | null>;
  insertSession(
    tx: CounterSessionTx,
    orgId: OrgId,
    args: {
      clientEventId: string;
      kioskDeviceId: number | null;
      claimedByStaffId: number;
      /**
       * Which pane the session opens on. Passed EXPLICITLY rather than left to
       * `counter_sessions.active_command`'s `DEFAULT 'retail'`: the opening
       * command is a per-org choice (`OrgSettings.kiosk.defaultCommand`), and a
       * column default cannot express one. Operator 2026-09-15 — the counter
       * must open on repair unless the org says otherwise.
       */
      activeCommand: KioskCommandId;
    },
  ): Promise<number>;
  /** Conditional bump. Returns the new version, or null when `expected` lost. */
  bumpVersion(
    tx: CounterSessionTx,
    orgId: OrgId,
    sessionId: number,
    expected: number,
  ): Promise<number | null>;
  patchHeader(tx: CounterSessionTx, orgId: OrgId, sessionId: number, patch: HeaderPatch): Promise<void>;
  insertLine(tx: CounterSessionTx, orgId: OrgId, sessionId: number, line: NewLineInput): Promise<void>;
  /**
   * Device ids this staffer currently holds a LIVE lease on.
   *
   * Feeds the desk's Ably grant, so an expired lease must not appear here — a
   * staffer who walked away should stop receiving that counter's traffic when
   * their next token is minted, without anyone having to revoke anything.
   */
  listClaimedDeviceIds(tx: CounterSessionTx, orgId: OrgId, staffId: number): Promise<number[]>;
  /**
   * The OPEN session bound to this device, if any.
   *
   * `ux_counter_sessions_open_device` makes this at most one row, which is what
   * lets the tablet ask "what am I showing?" without being told a session id it
   * has no way to learn — and without a list endpoint a stranger could walk.
   */
  findOpenSessionIdForDevice(
    tx: CounterSessionTx,
    orgId: OrgId,
    deviceId: number,
  ): Promise<number | null>;
  /**
   * The idempotency anchor minted when the session opened (P1).
   *
   * Read from the row rather than passed in, so a retried submit — from either
   * device, or from a client that reloaded — reuses the SAME anchor and
   * `ux_counter_transactions_client_event` turns the replay into a no-op
   * instead of a second charge.
   */
  readClientEventId(tx: CounterSessionTx, orgId: OrgId, sessionId: number): Promise<string | null>;
  /** COMPOSED, never re-implemented — this is the one path that writes money. */
  submitTransaction: typeof submitCounterTransaction;
  /** The Square order the submit staged, if any. */
  readStagedOrderId(tx: CounterSessionTx, orgId: OrgId, sessionId: number): Promise<string | null>;
  /** Ask the stand for a card. Injected so the verb is testable with no Square. */
  startTerminal: typeof createTerminalCheckout;
  /** The session holding a live Terminal checkout — the webhook's only key. */
  findSessionIdByCheckout(
    tx: CounterSessionTx,
    orgId: OrgId,
    checkoutId: string,
  ): Promise<number | null>;
  newIdempotencyKey(): string;
  /** False when no line matched — a void racing a resync, not an error to throw. */
  patchLine(
    tx: CounterSessionTx,
    orgId: OrgId,
    sessionId: number,
    lineUuid: string,
    patch: LinePatch,
  ): Promise<boolean>;
  now(): number;
}

// ── Guards ──────────────────────────────────────────────────────────────────

/**
 * D5, revised 2026-08-20: the counter is a form TWO PEOPLE fill at once.
 *
 * The first cut made the tablet read-only. That was wrong for the actual job:
 * a customer walks in, and staff and customer fill the visit out together —
 * the customer entering their own details and device symptoms on the tablet
 * while staff price and correct on the desktop. A read-only tablet turns that
 * into dictation.
 *
 * So the boundary moved from WHO to WHAT. The tablet may create and correct
 * lines and identity. It may not touch **money or finality**:
 *
 *   price override · discount · void · claim/release · park · submit
 *
 * That is the line worth defending, because it is the one an unattended device
 * makes dangerous: the device principal outlives the customer standing there,
 * so anything it can do, a stranger can do after they leave. Editing a serial
 * number costs a correction; zeroing a price is an open till.
 */
function refuseDeviceWrite(actor: CounterSessionActor): CounterSessionError | null {
  return actor.kind === 'kiosk' ? 'DEVICE_FORBIDDEN' : null;
}

/**
 * Money fields, refused for a device principal at the DOMAIN, not the route.
 *
 * Returns the refusal when a kiosk actor's patch touches an amount. The kiosk
 * routes also omit the field from their schema, which is belt; this is braces —
 * and it is the one that survives someone adding a new kiosk route later.
 */
function refuseDeviceMoneyEdit(
  actor: CounterSessionActor,
  patch: { unitAmountCents?: number },
): CounterSessionError | null {
  if (actor.kind !== 'kiosk') return null;
  return patch.unitAmountCents === undefined ? null : 'DEVICE_FORBIDDEN';
}

/** A cart mutation only makes sense on an OPEN session. */
function refuseClosed(snapshot: CounterSessionSnapshot): CounterSessionError | null {
  return snapshot.status === 'open' ? null : 'SESSION_CLOSED';
}

/**
 * Is this desk the lease holder?
 *
 * An expired lease is NOT the holder — otherwise a closed laptop would keep
 * the counter forever and the next staffer would have to wait out a human,
 * not a timeout.
 */
export function holdsLease(
  snapshot: CounterSessionSnapshot,
  staffId: number,
  nowMs: number,
): boolean {
  if (snapshot.claimedByStaffId !== staffId) return false;
  return snapshot.claimExpiresAtMs === null || snapshot.claimExpiresAtMs > nowMs;
}

function leaseIsLive(snapshot: CounterSessionSnapshot, nowMs: number): boolean {
  return (
    snapshot.claimedByStaffId !== null &&
    (snapshot.claimExpiresAtMs === null || snapshot.claimExpiresAtMs > nowMs)
  );
}

// ── The verbs ───────────────────────────────────────────────────────────────

interface MutateArgs<T> {
  orgId: OrgId;
  sessionId: number;
  expectedVersion: number;
  actor: CounterSessionActor;
  deps: CounterSessionDeps;
  /** Runs INSIDE the transaction, before the version bump. */
  write: (tx: CounterSessionTx, snapshot: CounterSessionSnapshot) => Promise<T | CounterSessionError>;
  /** Builds the event to publish, from the post-write version. */
  event: (version: number, written: T) => CounterSessionEvent;
  /** Extra refusals beyond closed-session, evaluated on the loaded snapshot. */
  guard?: (snapshot: CounterSessionSnapshot) => CounterSessionError | null;
  /** Park/resume must run on a non-open session, so it opts out. */
  allowClosed?: boolean;
}

/**
 * Thrown to ROLL BACK a mutation whose version bump lost the race.
 *
 * This is not stylistic. `withTenantTransaction` commits when its callback
 * RETURNS and rolls back only when it THROWS — so returning a refusal after the
 * line insert had already run committed the line and reported failure. The
 * caller saw `VERSION_CONFLICT`, re-rendered from the snapshot in the response…
 * and the cart it re-rendered contained the line it had just been told was not
 * written. Caught by the P6 two-device spec, which is exactly the class of bug a
 * unit test with an in-memory fake cannot see.
 */
class CounterSessionConflict extends Error {
  constructor() {
    super('counter session version conflict');
    this.name = 'CounterSessionConflict';
  }
}

/**
 * The one mutation shape: load → guard → write → conditional bump → re-read.
 *
 * Every verb goes through here so the version discipline cannot be
 * accidentally skipped by a verb that "just" patches one column.
 */
async function mutate<T>(args: MutateArgs<T>): Promise<CounterSessionResult> {
  const { orgId, sessionId, expectedVersion, deps } = args;

  try {
    return await deps.runInTransaction(orgId, async (tx) => {
    const snapshot = await deps.readSnapshot(tx, orgId, sessionId);
    if (!snapshot) return { ok: false, code: 'NOT_FOUND', snapshot: null } as const;

    if (!args.allowClosed) {
      const closed = refuseClosed(snapshot);
      if (closed) return { ok: false, code: closed, snapshot } as const;
    }

    const guarded = args.guard?.(snapshot) ?? null;
    if (guarded) return { ok: false, code: guarded, snapshot } as const;

    const written = await args.write(tx, snapshot);
    if (typeof written === 'string') {
      return { ok: false, code: written as CounterSessionError, snapshot } as const;
    }

    const version = await deps.bumpVersion(tx, orgId, sessionId, expectedVersion);
    if (version === null) {
      // Someone else moved first. THROW, so the write above is rolled back —
      // see CounterSessionConflict. The current snapshot is re-read outside the
      // transaction, because a read in here would still see our own doomed write.
      throw new CounterSessionConflict();
    }

    const after = await deps.readSnapshot(tx, orgId, sessionId);
    return {
      ok: true,
      snapshot: after ?? { ...snapshot, version },
      event: args.event(version, written as T),
    } as const;
    });
  } catch (err) {
    if (err instanceof CounterSessionConflict) {
      const current = await deps.runInTransaction(orgId, (tx) =>
        deps.readSnapshot(tx, orgId, sessionId),
      );
      return { ok: false, code: 'VERSION_CONFLICT', snapshot: current };
    }
    throw err;
  }
}

export async function createSession(
  orgId: OrgId,
  actor: CounterSessionActor,
  args: {
    clientEventId: string;
    kioskDeviceId?: number | null;
    /**
     * The org's opening command (`getKioskDefaultCommand`). Resolved by the
     * route, which holds the org, rather than read behind this function —
     * `CounterSessionDeps` is the whole I/O surface here and a settings read
     * hidden inside it would be a second, untestable one.
     */
    activeCommand?: KioskCommandId;
  },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  // The desk opens every shared session (D5) — a walk-up with no desk keeps
  // today's standalone local cart until someone claims the device.
  if (actor.kind !== 'desk') {
    return { ok: false, code: 'DEVICE_FORBIDDEN', snapshot: null };
  }

  return deps.runInTransaction(orgId, async (tx) => {
    const sessionId = await deps.insertSession(tx, orgId, {
      clientEventId: args.clientEventId,
      kioskDeviceId: args.kioskDeviceId ?? null,
      claimedByStaffId: actor.staffId,
      activeCommand: args.activeCommand ?? KIOSK_FALLBACK_COMMAND,
    });
    const snapshot = (await deps.readSnapshot(tx, orgId, sessionId)) ?? emptySessionSnapshot(sessionId);
    return {
      ok: true,
      snapshot,
      event: {
        type: 'session.snapshot',
        sessionId,
        version: snapshot.version,
        actor: 'server',
        snapshot,
      },
    } as const;
  });
}

export async function getSession(
  orgId: OrgId,
  sessionId: number,
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionSnapshot | null> {
  return deps.runInTransaction(orgId, (tx) => deps.readSnapshot(tx, orgId, sessionId));
}

/**
 * What this tablet is currently showing.
 *
 * Device-scoped by construction: the caller passes its own `deviceId` from the
 * verified device principal, never a session id from the request. A device that
 * is not bound to an open session sees `null` and falls back to its standalone
 * local cart (plan D7).
 */
export async function getSessionForDevice(
  orgId: OrgId,
  deviceId: number,
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionSnapshot | null> {
  return deps.runInTransaction(orgId, async (tx) => {
    const sessionId = await deps.findOpenSessionIdForDevice(tx, orgId, deviceId);
    if (sessionId === null) return null;
    return deps.readSnapshot(tx, orgId, sessionId);
  });
}

/**
 * Which tablets this desk may listen to right now (P3).
 *
 * Resolved from the lease server-side and never from the request — a device id
 * a client could name would make its own realtime grant self-service.
 */
export async function listClaimedDeviceIds(
  orgId: OrgId,
  staffId: number,
  deps: CounterSessionDeps = defaultDeps,
): Promise<number[]> {
  return deps.runInTransaction(orgId, (tx) => deps.listClaimedDeviceIds(tx, orgId, staffId));
}

export async function claimSession(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; staffName: string; leaseMs?: number; takeover?: boolean },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  const denied = refuseDeviceWrite(actor);
  if (denied) return { ok: false, code: denied, snapshot: null };
  const staffId = (actor as { staffId: number }).staffId;
  const expiresAt = deps.now() + (args.leaseMs ?? DEFAULT_CLAIM_LEASE_MS);

  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    guard: (snapshot) => {
      // A live lease held by someone ELSE needs an explicit takeover — the
      // prompt naming the holder is the point. Renewing your own is always fine.
      if (snapshot.claimedByStaffId === staffId) return null;
      if (!leaseIsLive(snapshot, deps.now())) return null;
      return args.takeover ? null : 'CLAIMED_BY_OTHER';
    },
    write: async (tx) => {
      await deps.patchHeader(tx, orgId, sessionId, {
        claimedByStaffId: staffId,
        claimExpiresAtMs: expiresAt,
      });
      return { staffId, staffName: args.staffName, expiresAt };
    },
    event: (version, written) => ({
      type: 'session.claimed',
      sessionId,
      version,
      actor: 'desk',
      staffId: written.staffId,
      staffName: written.staffName,
      claimExpiresAtMs: written.expiresAt,
    }),
  });
}

export async function releaseSession(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; reason: 'done' | 'takeover' | 'expired' },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  const denied = refuseDeviceWrite(actor);
  if (denied) return { ok: false, code: denied, snapshot: null };

  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    allowClosed: true, // a parked session still has a lease to hand back
    write: async (tx) => {
      await deps.patchHeader(tx, orgId, sessionId, {
        claimedByStaffId: null,
        claimExpiresAtMs: null,
      });
      return { reason: args.reason };
    },
    event: (version, written) => ({
      type: 'session.released',
      sessionId,
      version,
      actor: 'desk',
      reason: written.reason,
    }),
  });
}

/**
 * Put this visit on a tablet — or take it off one (`kioskDeviceId: null`).
 *
 * This is the verb the whole desk↔iPad bridge was missing. A tablet enrols to
 * the ORG, never to a desk, so nothing about pairing tells the tablet which
 * visit to show; `getSessionForDevice` answers "what am I showing?" by looking
 * for the open session BOUND to that device, and until this ran the only way to
 * set that binding was at `createSession` time. A desk that had already opened
 * a visit could never hand it to a tablet, and `session-fanout` short-circuits
 * on a null device, so such a visit published nothing to anyone.
 *
 * **One tablet, one open visit.** `ux_counter_sessions_open_device` enforces it
 * in the schema; the pre-check here turns the constraint violation into
 * `DEVICE_BUSY`, which the desk can say out loud ("that iPad is on another
 * visit") instead of a 500. The check runs in the `write` step rather than
 * `guard` because it needs the transaction — and being inside it is what makes
 * the read-then-write atomic against a second desk binding the same iPad.
 *
 * Desk-only, like every other header verb (D5): a tablet naming its own
 * session would be a session-enumeration surface on an unattended device.
 */
export async function bindSessionDevice(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; kioskDeviceId: number | null },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  const denied = refuseDeviceWrite(actor);
  if (denied) return { ok: false, code: denied, snapshot: null };

  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    write: async (tx, snapshot) => {
      const target = args.kioskDeviceId;
      if (target !== null && target !== snapshot.kioskDeviceId) {
        const holder = await deps.findOpenSessionIdForDevice(tx, orgId, target);
        if (holder !== null && holder !== sessionId) return 'DEVICE_BUSY';
      }
      await deps.patchHeader(tx, orgId, sessionId, { kioskDeviceId: target });
      return { kioskDeviceId: target };
    },
    event: (version, written) => ({
      type: 'session.device_bound',
      sessionId,
      version,
      actor: 'desk',
      kioskDeviceId: written.kioskDeviceId,
    }),
  });
}

/**
 * Work · Show · Verify. Does not touch lines, identity, or command.
 *
 * Allowed from desk **and** kiosk: the iPad chrome and a flipped tablet both
 * need to publish the stance so the other screen converges. Money stays
 * staff-only; this is not money.
 */
export async function setConsultStance(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; consultStance: ConsultStance },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  const face = faceFromConsultStance(args.consultStance);
  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    write: async (tx) => {
      await deps.patchHeader(tx, orgId, sessionId, {
        consultStance: args.consultStance,
        face,
      });
      return { consultStance: args.consultStance, face };
    },
    event: (version, written) => ({
      type: 'session.face_changed',
      sessionId,
      version,
      actor: actor.kind === 'kiosk' ? 'kiosk' : 'desk',
      face: written.face,
      consultStance: written.consultStance,
    }),
  });
}

/**
 * What Show paints. Does not touch lines, identity, command, or stance.
 * Desk and kiosk both write — staff on either screen picks the proposal.
 */
export async function setConsultPresentation(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; presentation: ConsultPresentation },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    write: async (tx) => {
      await deps.patchHeader(tx, orgId, sessionId, {
        presentation: args.presentation,
      });
      return { presentation: args.presentation };
    },
    event: (version, written) => ({
      type: 'session.presentation_changed',
      sessionId,
      version,
      actor: actor.kind === 'kiosk' ? 'kiosk' : 'desk',
      presentation: written.presentation,
    }),
  });
}

export async function addLine(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; line: NewLineInput },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  // A tablet may stage a line — that is the customer describing what they
  // brought in — but it may not name a NON-ZERO amount. Pricing is staff work,
  // and a device that can price is a device that can price at zero.
  if (actor.kind === 'kiosk' && args.line.unitAmountCents !== 0) {
    return { ok: false, code: 'DEVICE_FORBIDDEN', snapshot: null };
  }

  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    write: async (tx) => {
      await deps.insertLine(tx, orgId, sessionId, args.line);
      return args.line;
    },
    event: (version, written) => ({
      type: 'line.added',
      sessionId,
      version,
      actor: actor.kind === 'kiosk' ? 'kiosk' : 'desk',
      line: toSessionLine(written),
    }),
  });
}

export async function updateLine(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  lineUuid: string,
  args: { expectedVersion: number; patch: LinePatch },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  const denied = refuseDeviceMoneyEdit(actor, args.patch);
  if (denied) return { ok: false, code: denied, snapshot: null };

  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    write: async (tx) => {
      const hit = await deps.patchLine(tx, orgId, sessionId, lineUuid, args.patch);
      return hit ? { lineUuid } : ('LINE_NOT_FOUND' as const);
    },
    event: (version, _written) => ({
      type: 'line.updated',
      sessionId,
      version,
      actor: actor.kind === 'kiosk' ? 'kiosk' : 'desk',
      // The row the caller re-reads is authoritative; this carries the id so a
      // subscriber can find its line without a second round trip.
      line: { id: lineUuid } as unknown as CounterSessionLine,
    }),
  });
}

export async function voidLine(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  lineUuid: string,
  args: { expectedVersion: number; reason: string | null },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  const denied = refuseDeviceWrite(actor);
  if (denied) return { ok: false, code: denied, snapshot: null };
  const staffId = (actor as { staffId: number }).staffId;
  const voidedAtMs = deps.now();

  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    write: async (tx) => {
      const hit = await deps.patchLine(tx, orgId, sessionId, lineUuid, {
        voidedAtMs,
        voidReason: args.reason,
        voidedByStaffId: staffId,
      });
      return hit ? { lineUuid } : ('LINE_NOT_FOUND' as const);
    },
    event: (version) => ({
      type: 'line.voided',
      sessionId,
      version,
      actor: 'desk',
      lineId: lineUuid,
      voidedAtMs,
      voidReason: args.reason,
      voidedByStaffId: staffId,
    }),
  });
}

/**
 * Set the customer. **Both doors may call this** — it is one of the tablet's
 * three verbs, because the person whose phone number it is, is standing at the
 * tablet.
 */
export async function setCustomer(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; customer: CounterSessionCustomer },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    write: async (tx) => {
      await deps.patchHeader(tx, orgId, sessionId, { customer: args.customer });
      return args.customer;
    },
    event: (version, written) => ({
      type: 'session.customer_changed',
      sessionId,
      version,
      actor: actor.kind === 'kiosk' ? 'kiosk' : 'desk',
      customer: written,
    }),
  });
}

/**
 * Sign a repair line. **Kiosk-only in practice and by intent** — a signature
 * captured on the staff desktop is a signature the customer did not give.
 * The desk is refused here, which is the one place this module's asymmetry
 * runs the other way.
 */
export async function signLine(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  lineUuid: string,
  args: { expectedVersion: number; signatureDataUrl: string; signatureStrokes?: unknown },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  if (actor.kind !== 'kiosk') {
    return { ok: false, code: 'DEVICE_FORBIDDEN', snapshot: null };
  }

  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    write: async (tx, snapshot) => {
      const target = snapshot.lines.find((l) => l.id === lineUuid);
      if (!target) return 'LINE_NOT_FOUND' as const;
      if (target.type !== 'REPAIR' || !isRepairPayload(target.payload)) {
        return 'LINE_NOT_REPAIR' as const;
      }
      const payload: KioskLinePayload = {
        ...target.payload,
        signatureDataUrl: args.signatureDataUrl,
        signatureStrokes: args.signatureStrokes ?? target.payload.signatureStrokes,
      };
      await deps.patchLine(tx, orgId, sessionId, lineUuid, { payload });
      return { lineUuid, payload };
    },
    event: (version, written) => ({
      type: 'line.updated',
      sessionId,
      version,
      actor: 'kiosk',
      line: { id: written.lineUuid, payload: written.payload } as unknown as CounterSessionLine,
    }),
  });
}

/** Park / resume / void the whole visit (D8). Desk only. */
export async function setSessionStatus(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; status: CounterSessionStatus },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  const denied = refuseDeviceWrite(actor);
  if (denied) return { ok: false, code: denied, snapshot: null };

  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    allowClosed: true, // resuming a parked session is the whole point
    guard: (snapshot) =>
      // Submitted is terminal here: unwinding a charged visit is a refund, not
      // a status edit, and it must not look like one.
      snapshot.status === 'submitted' ? 'SESSION_CLOSED' : null,
    write: async (tx) => {
      await deps.patchHeader(tx, orgId, sessionId, { status: args.status });
      return { status: args.status };
    },
    event: (version, written) => ({
      type: 'session.status_changed',
      sessionId,
      version,
      actor: 'desk',
      status: written.status,
    }),
  });
}

/**
 * The staged-cart gate. Lives in `./submit-blocker` so the DESK can call it
 * too — this module imports `pg`, which puts anything defined here out of a
 * client component's reach. Re-exported rather than moved-and-forgotten so
 * every existing server caller keeps working and there is still one answer to
 * "can this be submitted".
 */
export { submitBlocker, type CounterSubmitBlocker } from './submit-blocker';

export interface SubmitSessionOutcome {
  transaction: CounterTransactionResult;
}

/**
 * Finish the visit: hand the staged cart to the transaction orchestrator.
 *
 * **Composes `submitCounterTransaction`; it does not re-implement it.** That
 * function owns customer create-or-match, the repair intake, provider order
 * staging, the ticket outbox and every partial-failure rule — all of which are
 * already tested. Mapping is `mapKioskCartToCounterParts`, the same mapper the
 * kiosk's own submit uses, so a visit finished from the desk and one finished
 * from the tablet produce the same two records.
 *
 * The session's own `client_event_id` is the anchor, so a double-submit from
 * two devices is one transaction (D8).
 */
export async function submitSession(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; steppedUpStaffId?: number | null },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult & { outcome?: SubmitSessionOutcome }> {
  let outcome: SubmitSessionOutcome | undefined;

  const result = await mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    guard: (snapshot) => submitBlocker(snapshot),
    write: async (tx, snapshot) => {
      const clientEventId = await deps.readClientEventId(tx, orgId, sessionId);
      if (!clientEventId) return 'SUBMIT_REJECTED' as const;

      const live = snapshot.lines.filter((l) => l.voidedAtMs === null);
      const parts = mapKioskCartToCounterParts(
        live.map((l) => ({
          id: l.id,
          type: l.type,
          title: l.title,
          quantity: l.quantity,
          unitAmountCents: l.unitAmountCents,
          payload: l.payload,
        })),
      );

      const transaction = await deps.submitTransaction(
        {
          customer: {
            phone: snapshot.customer.phone,
            name: snapshot.customer.name || null,
            email: snapshot.customer.email || null,
          },
          retailLines: parts.retailLines,
          services: parts.services,
          clientEventId,
          kioskDeviceId: snapshot.kioskDeviceId,
          steppedUpStaffId: args.steppedUpStaffId ?? null,
        },
        orgId,
      );

      await deps.patchHeader(tx, orgId, sessionId, {
        status: 'submitted',
        counterTransactionId: transaction.counterTransactionId,
        submittedAtMs: deps.now(),
      });
      outcome = { transaction };
      return { transaction };
    },
    event: (version, written) => ({
      type: 'session.submitted',
      sessionId,
      version,
      actor: actor.kind === 'kiosk' ? 'kiosk' : 'desk',
      counterTransactionId: written.transaction.counterTransactionId,
    }),
  });

  return outcome ? { ...result, outcome } : result;
}

// ── Card present (SQ2) ──────────────────────────────────────────────────────

/**
 * Send the staged order to the Square Terminal and put both faces into the
 * "present card" state.
 *
 * **Sequenced AFTER submit, deliberately.** The kiosk stages an order and never
 * charges (plan D4), so the Square order — the thing a Terminal checkout
 * collects for — does not exist until `submitSession` has run. Asking the stand
 * for a card before that would mean inventing a second, unstaged order and
 * charging for something no record describes.
 *
 * Desk-only: a device principal must not be able to summon a card prompt.
 */
export async function startTerminalCheckout(
  orgId: OrgId,
  actor: CounterSessionActor,
  sessionId: number,
  args: { expectedVersion: number; deviceId: string },
  deps: CounterSessionDeps = defaultDeps,
): Promise<CounterSessionResult> {
  const denied = refuseDeviceWrite(actor);
  if (denied) return { ok: false, code: denied, snapshot: null };
  const startedAtMs = deps.now();

  return mutate({
    orgId,
    sessionId,
    expectedVersion: args.expectedVersion,
    actor,
    deps,
    // A submitted session is "closed" to cart edits but is exactly when payment
    // happens, so this verb opts out of that guard and states its own.
    allowClosed: true,
    guard: (snapshot) => {
      if (snapshot.status !== 'submitted') return 'NOT_SUBMITTED';
      // Two prompts on one stand is how a customer gets charged twice.
      if (snapshot.paymentState === 'awaiting_card') return 'ALREADY_AWAITING_CARD';
      return null;
    },
    write: async (tx) => {
      const orderId = await deps.readStagedOrderId(tx, orgId, sessionId);
      // No staged order means nothing to collect against — a repair-only visit
      // with no retail lines, or a provider that was not connected at submit.
      if (!orderId) return 'NO_STAGED_ORDER' as const;

      const started = await deps.startTerminal(orgId, {
        deviceId: args.deviceId,
        orderId,
        idempotencyKey: deps.newIdempotencyKey(),
      });
      if (!started.ok) return 'TERMINAL_REFUSED' as const;

      await deps.patchHeader(tx, orgId, sessionId, {
        paymentState: 'awaiting_card',
        terminalCheckoutId: started.checkoutId,
        awaitingCardSinceMs: startedAtMs,
      });
      return { checkoutId: started.checkoutId };
    },
    event: (version, written) => ({
      type: 'session.payment_changed',
      sessionId,
      version,
      actor: 'desk',
      paymentState: 'awaiting_card',
      terminalCheckoutId: written.checkoutId,
      awaitingCardSinceMs: startedAtMs,
    }),
  });
}

/**
 * Land a Terminal outcome on the session it belongs to.
 *
 * Called by the webhook, which knows a checkout id and nothing else — so the
 * session is resolved from that, never from a request body.
 *
 * `approved` here is the DEVICE's answer. The money's answer arrives separately
 * on `payment.completed` and settles `counter_transactions.status` (SQ1); this
 * never touches that. A visit that reads "approved" but not yet "paid" is not a
 * bug, it is the two facts arriving in their own time.
 */
export async function resolveTerminalCheckout(
  orgId: OrgId,
  args: { checkoutId: string; paymentState: CounterPaymentState },
  deps: CounterSessionDeps = defaultDeps,
): Promise<{ resolved: boolean; sessionId?: number }> {
  const checkoutId = String(args.checkoutId ?? '').trim();
  if (!checkoutId) return { resolved: false };

  return deps.runInTransaction(orgId, async (tx) => {
    const sessionId = await deps.findSessionIdByCheckout(tx, orgId, checkoutId);
    // A checkout this deployment did not start (another lane, another surface).
    if (sessionId === null) return { resolved: false };

    const snapshot = await deps.readSnapshot(tx, orgId, sessionId);
    if (!snapshot) return { resolved: false };
    // Terminal webhooks redeliver and can arrive out of order; an outcome is
    // final, so a later `awaiting_card` must not reopen a settled prompt.
    if (isTerminalPaymentOutcome(snapshot.paymentState)) {
      return { resolved: true, sessionId };
    }

    await deps.patchHeader(tx, orgId, sessionId, {
      paymentState: args.paymentState,
      // The prompt is down once there is an outcome; keep the id for the audit
      // trail and for a second webhook to find the same row.
      awaitingCardSinceMs: isTerminalPaymentOutcome(args.paymentState)
        ? null
        : snapshot.awaitingCardSinceMs,
    });
    // The version bump is intentionally NOT taken here: this is a server-side
    // fact landing on the row, and both faces learn it from the published event
    // (or the next poll), not from an optimistic write they raced.
    return { resolved: true, sessionId };
  });
}

function toSessionLine(input: NewLineInput): CounterSessionLine {
  return {
    id: input.lineUuid,
    type: input.type,
    title: input.title,
    quantity: input.quantity,
    unitAmountCents: input.unitAmountCents,
    payload: input.payload,
    sortIndex: input.sortIndex,
    voidedAtMs: null,
    voidReason: null,
    voidedByStaffId: null,
  };
}

// ── Default (DB-backed) deps ────────────────────────────────────────────────

function asClient(tx: CounterSessionTx): PoolClient {
  return tx as PoolClient;
}

function msOrNull(value: Date | string | null): number | null {
  if (value === null) return null;
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

const defaultDeps: CounterSessionDeps = {
  runInTransaction(orgId, fn) {
    return withTenantTransaction(orgId, (client) => fn(client));
  },

  async readSnapshot(tx, orgId, sessionId) {
    const header = await asClient(tx).query(
      `SELECT s.id, s.version, s.status, s.kiosk_device_id, s.claimed_by_staff_id,
              s.claim_expires_at, s.active_command, s.face, s.consult_stance,
              s.consult_presentation,
              s.customer_phone, s.customer_name, s.customer_email,
              s.counter_transaction_id, s.payment_state, s.terminal_checkout_id,
              s.awaiting_card_since, st.name AS claimed_by_staff_name
         FROM counter_sessions s
         LEFT JOIN staff st ON st.id = s.claimed_by_staff_id
        WHERE s.id = $1 AND s.organization_id = $2
        LIMIT 1`,
      [sessionId, orgId],
    );
    const row = header.rows[0];
    if (!row) return null;

    const lines = await asClient(tx).query(
      `SELECT line_uuid, type, title, quantity, unit_amount_cents, payload,
              sort_index, voided_at, void_reason, voided_by_staff_id
         FROM counter_session_lines
        WHERE session_id = $1 AND organization_id = $2
        ORDER BY sort_index ASC, id ASC`,
      [sessionId, orgId],
    );

    return {
      sessionId: Number(row.id),
      version: Number(row.version),
      status: row.status as CounterSessionStatus,
      kioskDeviceId: row.kiosk_device_id === null ? null : Number(row.kiosk_device_id),
      claimedByStaffId: row.claimed_by_staff_id === null ? null : Number(row.claimed_by_staff_id),
      claimedByStaffName: row.claimed_by_staff_name ?? null,
      claimExpiresAtMs: msOrNull(row.claim_expires_at),
      activeCommand: row.active_command as KioskCommandId,
      face: row.face as CounterSessionFace,
      consultStance: (row.consult_stance as ConsultStance | null) ?? consultStanceFromFace(row.face as CounterSessionFace),
      presentation: parseConsultPresentation(row.consult_presentation),
      customer: {
        phone: row.customer_phone ?? '',
        name: row.customer_name ?? '',
        email: row.customer_email ?? '',
      },
      lines: lines.rows.map((l) => ({
        id: String(l.line_uuid),
        type: l.type as KioskCartLine['type'],
        title: l.title,
        quantity: Number(l.quantity),
        unitAmountCents: Number(l.unit_amount_cents),
        payload: (l.payload ?? {}) as KioskLinePayload,
        sortIndex: Number(l.sort_index),
        voidedAtMs: msOrNull(l.voided_at),
        voidReason: l.void_reason ?? null,
        voidedByStaffId: l.voided_by_staff_id === null ? null : Number(l.voided_by_staff_id),
      })),
      counterTransactionId:
        row.counter_transaction_id === null ? null : Number(row.counter_transaction_id),
      paymentState: (row.payment_state ?? 'idle') as CounterPaymentState,
      terminalCheckoutId: row.terminal_checkout_id ?? null,
      awaitingCardSinceMs: msOrNull(row.awaiting_card_since),
    };
  },

  async insertSession(tx, orgId, args) {
    const res = await asClient(tx).query(
      `INSERT INTO counter_sessions
         (organization_id, kiosk_device_id, claimed_by_staff_id, client_event_id, active_command)
       VALUES ($1, $2, $3, $4::uuid, $5)
       RETURNING id`,
      [
        orgId,
        args.kioskDeviceId,
        args.claimedByStaffId,
        args.clientEventId,
        args.activeCommand,
      ],
    );
    return Number(res.rows[0].id);
  },

  async bumpVersion(tx, orgId, sessionId, expected) {
    const res = await asClient(tx).query(
      `UPDATE counter_sessions
          SET version = version + 1, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND version = $3
        RETURNING version`,
      [sessionId, orgId, expected],
    );
    return res.rows[0] ? Number(res.rows[0].version) : null;
  },

  async patchHeader(tx, orgId, sessionId, patch) {
    const sets: string[] = [];
    const values: unknown[] = [sessionId, orgId];
    const push = (sql: string, value: unknown) => {
      values.push(value);
      sets.push(`${sql} = $${values.length}`);
    };

    if (patch.paymentState !== undefined) push('payment_state', patch.paymentState);
    if (patch.terminalCheckoutId !== undefined) {
      push('terminal_checkout_id', patch.terminalCheckoutId);
    }
    if (patch.awaitingCardSinceMs !== undefined) {
      values.push(patch.awaitingCardSinceMs === null ? null : new Date(patch.awaitingCardSinceMs));
      sets.push(`awaiting_card_since = $${values.length}`);
    }
    if (patch.counterTransactionId !== undefined) {
      push('counter_transaction_id', patch.counterTransactionId);
    }
    if (patch.submittedAtMs !== undefined) {
      values.push(patch.submittedAtMs === null ? null : new Date(patch.submittedAtMs));
      sets.push(`submitted_at = $${values.length}`);
    }
    if ('kioskDeviceId' in patch) push('kiosk_device_id', patch.kioskDeviceId);
    if ('claimedByStaffId' in patch) push('claimed_by_staff_id', patch.claimedByStaffId);
    if (patch.claimExpiresAtMs !== undefined) {
      values.push(patch.claimExpiresAtMs === null ? null : new Date(patch.claimExpiresAtMs));
      sets.push(`claim_expires_at = $${values.length}`);
    }
    if (patch.status) push('status', patch.status);
    if (patch.activeCommand) push('active_command', patch.activeCommand);
    if (patch.face) push('face', patch.face);
    if (patch.consultStance) push('consult_stance', patch.consultStance);
    if (patch.presentation !== undefined) {
      values.push(JSON.stringify(patch.presentation));
      sets.push(`consult_presentation = $${values.length}::jsonb`);
    }
    if (patch.customer) {
      push('customer_phone', patch.customer.phone);
      push('customer_name', patch.customer.name);
      push('customer_email', patch.customer.email);
    }
    if (sets.length === 0) return;

    await asClient(tx).query(
      `UPDATE counter_sessions SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      values,
    );
  },

  async insertLine(tx, orgId, sessionId, line) {
    await asClient(tx).query(
      `INSERT INTO counter_session_lines
         (organization_id, session_id, line_uuid, type, title, quantity,
          unit_amount_cents, payload, sort_index)
       VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8::jsonb, $9)
       ON CONFLICT (organization_id, session_id, line_uuid) DO NOTHING`,
      [
        orgId,
        sessionId,
        line.lineUuid,
        line.type,
        line.title,
        line.quantity,
        line.unitAmountCents,
        JSON.stringify(line.payload ?? {}),
        line.sortIndex,
      ],
    );
  },

  async listClaimedDeviceIds(tx, orgId, staffId) {
    const res = await asClient(tx).query(
      `SELECT DISTINCT kiosk_device_id
         FROM counter_sessions
        WHERE organization_id = $1
          AND claimed_by_staff_id = $2
          AND status = 'open'
          AND kiosk_device_id IS NOT NULL
          AND (claim_expires_at IS NULL OR claim_expires_at > now())`,
      [orgId, staffId],
    );
    return res.rows.map((r) => Number(r.kiosk_device_id));
  },

  async readClientEventId(tx, orgId, sessionId) {
    const res = await asClient(tx).query(
      `SELECT client_event_id FROM counter_sessions
        WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [sessionId, orgId],
    );
    return res.rows[0] ? String(res.rows[0].client_event_id) : null;
  },

  submitTransaction: submitCounterTransaction,

  async readStagedOrderId(tx, orgId, sessionId) {
    const res = await asClient(tx).query(
      `SELECT ct.staged_square_order_id
         FROM counter_sessions s
         JOIN counter_transactions ct ON ct.id = s.counter_transaction_id
        WHERE s.id = $1 AND s.organization_id = $2
        LIMIT 1`,
      [sessionId, orgId],
    );
    return res.rows[0]?.staged_square_order_id ?? null;
  },

  startTerminal: createTerminalCheckout,

  async findSessionIdByCheckout(tx, orgId, checkoutId) {
    const res = await asClient(tx).query(
      `SELECT id FROM counter_sessions
        WHERE organization_id = $1 AND terminal_checkout_id = $2
        LIMIT 1`,
      [orgId, checkoutId],
    );
    return res.rows[0] ? Number(res.rows[0].id) : null;
  },

  newIdempotencyKey: () => safeRandomUUID(),

  async findOpenSessionIdForDevice(tx, orgId, deviceId) {
    const res = await asClient(tx).query(
      `SELECT id FROM counter_sessions
        WHERE organization_id = $1 AND kiosk_device_id = $2 AND status = 'open'
        LIMIT 1`,
      [orgId, deviceId],
    );
    return res.rows[0] ? Number(res.rows[0].id) : null;
  },

  async patchLine(tx, orgId, sessionId, lineUuid, patch) {
    const sets: string[] = [];
    const values: unknown[] = [sessionId, orgId, lineUuid];
    const push = (sql: string, value: unknown) => {
      values.push(value);
      sets.push(`${sql} = $${values.length}`);
    };

    if (patch.title !== undefined) push('title', patch.title);
    if (patch.quantity !== undefined) push('quantity', patch.quantity);
    if (patch.unitAmountCents !== undefined) push('unit_amount_cents', patch.unitAmountCents);
    if (patch.payload !== undefined) {
      values.push(JSON.stringify(patch.payload));
      sets.push(`payload = $${values.length}::jsonb`);
    }
    if (patch.voidedAtMs !== undefined) {
      values.push(new Date(patch.voidedAtMs));
      sets.push(`voided_at = $${values.length}`);
    }
    if (patch.voidReason !== undefined) push('void_reason', patch.voidReason);
    if (patch.voidedByStaffId !== undefined) push('voided_by_staff_id', patch.voidedByStaffId);
    if (sets.length === 0) return false;

    const res = await asClient(tx).query(
      `UPDATE counter_session_lines SET ${sets.join(', ')}, updated_at = now()
        WHERE session_id = $1 AND organization_id = $2 AND line_uuid = $3::uuid`,
      values,
    );
    return (res.rowCount ?? 0) > 0;
  },

  now: () => Date.now(),
};
