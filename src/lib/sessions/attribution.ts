/**
 * Session attribution — the value every event writer must carry, and the
 * sentinel that says "not attributed" out loud.
 *
 * DEPENDENCY-FREE ON PURPOSE, exactly like ./types.ts. The scan path enqueues
 * attribution from a client bundle and the event spines stamp it on the server;
 * both ends must be able to import this without pulling `@/lib/db` in.
 *
 * Columns: `ops_events.session_id` + `.session_type` (2026-08-23b) and
 * `inventory_events.session_id` + `.session_type` (2026-08-23d).
 *
 * ── WHY A SENTINEL AND NOT AN OPTIONAL FIELD ────────────────────────────────
 *
 * `session?: SessionAttribution` would compile at all 46 existing call sites of
 * `recordInventoryEvent` / `recordOpsEvent` on the day this lands, and every one
 * of them would silently write NULL. The compiler would stay quiet about
 * precisely the sites that were missed — which is the failure mode this repo
 * has already paid for once, where a memoized lookup helper wrote attribution
 * ahead of the branch that was supposed to decide it and produced rows nobody
 * noticed were wrong until a report was.
 *
 * So the field is REQUIRED with NO DEFAULT, and {@link NO_SESSION} is how a
 * call site says "this path genuinely has no session yet". That makes the opt-
 * out a visible token in the source — `grep -rn NO_SESSION src/` is the work
 * list for threading sessions through the rest of the app, and it shrinks.
 *
 * ── WHY session_type IS CARRIED ALONGSIDE session_id ────────────────────────
 *
 * Because the columns are denormalized (see the 08-23b migration header):
 * reporting groups by type without a join, and the classification of a past
 * event must survive `ON DELETE SET NULL` clearing its session_id. Pairing them
 * in ONE value is what stops a writer stamping an id with no type, or a type
 * belonging to a different session.
 */

import { SCAN_SESSION_TYPES, type ScanSessionType, type WorkSession } from './types';

/**
 * The `session_type` column vocabulary: the session's discriminator as an
 * OPERATOR would name it.
 *
 * Deliberately NOT `work_sessions.kind`. `kind` is already implied — a value is
 * either 'task' or one of the scan types — and "how many events came out of
 * Unbox this week" is the question that actually gets asked, which `kind` can
 * only answer as "scan".
 */
export const SESSION_EVENT_TYPES = [...SCAN_SESSION_TYPES, 'task'] as const;
export type SessionEventType = ScanSessionType | 'task';

export function isSessionEventType(value: unknown): value is SessionEventType {
  return typeof value === 'string' && (SESSION_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * An event that happened inside a known session.
 *
 * `sessionType` MAY be null, and that is a real, named state rather than an
 * oversight — see {@link attributionWithUnknownType}. What the type system
 * forbids is the inverse: a `sessionType` with no `sessionId`, which would be a
 * bench label belonging to no session at all.
 */
export interface AttributedToSession {
  sessionId: number;
  sessionType: SessionEventType | null;
}

/** An event that did not. Both columns NULL, together. */
export interface UnattributedEvent {
  sessionId: null;
  sessionType: null;
}

export type SessionAttribution = AttributedToSession | UnattributedEvent;

/**
 * "This write has no session."
 *
 * Not an absence — a statement. Frozen so a caller cannot mutate the shared
 * sentinel into a real attribution and silently re-point every other call site
 * that references it.
 */
export const NO_SESSION: UnattributedEvent = Object.freeze({
  sessionId: null,
  sessionType: null,
});

/**
 * NULLISH-TOLERANT on purpose, despite the parameter being required in the type.
 *
 * TypeScript's guarantee stops at the boundary: an untyped JS caller, a JSON
 * body cast through an interface, or a stale compiled module can all deliver
 * `undefined` here. Every caller is a WRITE PATH, so throwing would take a
 * domain action down to fail at recording who did it — the exact inversion of
 * "an unattributed event is a reporting gap; a blocked scan is a stopped
 * warehouse". Absent attribution reads as unattributed, and the write proceeds.
 */
export function isAttributed(
  attribution: SessionAttribution | null | undefined,
): attribution is AttributedToSession {
  return attribution != null && attribution.sessionId != null;
}

/**
 * "I know which session, but not yet which bench."
 *
 * A DEGRADED attribution, and deliberately spelled out so it reads as one. The
 * event still lands on `(organization_id, session_id, occurred_at)` — so it is
 * still found by `sessionContents` and still counted in the session's work,
 * which is the part that matters most.
 *
 * What it gives up is the denormalization's insurance: if the session row is
 * ever deleted, `ON DELETE SET NULL` clears `session_id` and, with no type
 * beside it, the event becomes fully unattributed. That is a rare loss and a
 * strictly smaller one than the alternative — refusing the id outright would
 * drop the event from its session's contents immediately and always.
 *
 * Legitimate use is narrow: a post-commit, best-effort path that holds the
 * session id but would need a fresh query purely to decorate a label
 * (`revertAgentMutation` is the one such caller today). Anywhere the session
 * row is already in hand, use {@link attributionOf} and carry both.
 */
export function attributionWithUnknownType(sessionId: number): SessionAttribution {
  return Number.isSafeInteger(sessionId) && sessionId > 0
    ? { sessionId, sessionType: null }
    : NO_SESSION;
}

/**
 * The ONE mapper from a session row to the pair its events carry.
 *
 * Every writer goes through this rather than reading `.id` and `.scanType`
 * itself, because the 'task' literal has to come from somewhere and two places
 * choosing it independently is how a spine ends up with both 'task' and null
 * meaning the same thing.
 */
export function attributionOf(
  session: Pick<WorkSession, 'id' | 'kind' | 'scanType'> | null | undefined,
): SessionAttribution {
  if (!session) return NO_SESSION;
  if (session.kind === 'scan') {
    // A scan session without a scanType cannot exist (work_sessions_scan_type_chk
    // is an iff), but this function is also fed rows parsed from JSON bodies and
    // from other services. Keep the id, refuse to invent the type: stamping a
    // guessed bench onto an immutable event is worse than admitting we do not
    // know which one it was.
    return session.scanType
      ? { sessionId: session.id, sessionType: session.scanType }
      : attributionWithUnknownType(session.id);
  }
  return { sessionId: session.id, sessionType: 'task' };
}

/**
 * Parse an attribution off an untrusted wire body.
 *
 * Returns {@link NO_SESSION} rather than throwing: a malformed attribution must
 * degrade to an unattributed event, never fail the scan that carried it. An
 * unattributed event is a reporting gap; a rejected scan is a stopped bench.
 */
export function parseAttribution(value: unknown): SessionAttribution {
  if (!value || typeof value !== 'object') return NO_SESSION;
  const { sessionId, sessionType } = value as Record<string, unknown>;
  if (typeof sessionId !== 'number' || !Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return NO_SESSION;
  }
  // A missing or unrecognised type degrades to "session known, bench unknown"
  // rather than discarding the id — losing the id would drop the event out of
  // its own session's contents, which is a bigger loss than a missing label.
  // An unrecognised STRING is dropped rather than stored: the column feeds
  // grouped reporting, and an unknown value there becomes a phantom bench.
  if (!isSessionEventType(sessionType)) return attributionWithUnknownType(sessionId);
  return { sessionId, sessionType };
}
