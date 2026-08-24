/**
 * One guarded write per operator action kind, plus the honest verdict on
 * whether it can be undone.
 *
 * This is the operator twin of `dispatchApply`'s switch in
 * apply-agent-mutation.ts, and it is called from inside that same function so
 * both actor kinds land in one ledger, in one transaction, through one code
 * path. Every case here does exactly three things:
 *
 *   1. SNAPSHOT what it is about to change (under the row lock it is about to
 *      write through), because the inverse is made of the prior state and a
 *      snapshot taken after the write is worthless.
 *   2. Delegate the write to the module that owns the invariant —
 *      `work-sessions.ts` for the session lifecycle, `state-machine.ts` for the
 *      domain transitions. Nothing here re-implements a rule that lives
 *      somewhere else.
 *   3. Return an {@link ActionDisposition}: either the inverse descriptor that
 *      undoes it, or the REASON it cannot be undone. There is no third option
 *      and there is no silent null.
 *
 * ── ON "NOTHING CHANGED" ────────────────────────────────────────────────────
 *
 * Several of these actions are idempotent: arming a session that already holds
 * the wedge, parking one that is already parked. Those still write a ledger row
 * — the operator pressed the button and the record should say so — but they are
 * classified `irreversible` with the reason "nothing changed". That is not a
 * dodge. An undo control on a no-op is a lie in either direction: it either
 * does nothing (and the operator learns undo is unreliable) or it does the
 * OPPOSITE of the button they pressed (and the operator learns it is dangerous).
 */

import type { OrgId } from '@/lib/tenancy/constants';
import {
  armScanSession,
  endSession,
  parkSession,
  resumeSession,
  startSession,
} from '@/lib/sessions/work-sessions';
import { isScanSessionType } from '@/lib/sessions/types';
import { SERIAL_STATES, transition, type SerialState } from '@/lib/inventory/state-machine';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import type { InventoryEventStation, InventoryEventType } from '@/lib/inventory/events';
import type { PoolClient } from 'pg';
import { SESSION_ACTION_KINDS, type SessionActionKind } from './action-kinds';
import type { ActionDisposition } from './types';
import {
  disarmScanSessionOn,
  makeWorkSessionDepsForClient,
  readWorkSessionForUpdate,
  replaceSessionStateOn,
  type SessionActionClient,
} from './session-writes';
import { NO_SESSION } from '@/lib/sessions/attribution';

export type SessionActionOutcome =
  | { ok: true; disposition: ActionDisposition; targetRef: string | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

/** The declared reason, read back out of the registry so it is written once. */
function declaredReason(kind: SessionActionKind): string {
  const declared = SESSION_ACTION_KINDS[kind].reversibility;
  return declared.mode === 'irreversible'
    ? declared.reason
    : // decided_at_apply kinds always pass an explicit reason at the call site;
      // this branch exists only so the return type is a string.
      'No inverse was captured for this action.';
}

const NOTHING_CHANGED = 'Nothing changed — the session was already in this state.';

// ─── payload narrowing ───────────────────────────────────────────────────────
//
// Hand-rolled rather than Zod, matching `normalizeReassignPayload` next door:
// these payloads come from our own route layer, the error strings are read by
// an operator through the Process tool, and a schema library's message ("Invalid
// input: expected number, received string at .sessionId") is not one of those.

type Payload = Record<string, unknown>;

function intField(p: Payload, key: string): number | null {
  const v = p[key];
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

function optionalIntField(p: Payload, key: string): number | null {
  return p[key] == null ? null : intField(p, key);
}

function stringField(p: Payload, key: string): string | null {
  const v = p[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function boolField(p: Payload, key: string): boolean {
  return p[key] === true;
}

function objectField(p: Payload, key: string): Record<string, unknown> | null {
  const v = p[key];
  return v != null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * pg's `PoolClient['query']` is a set of overloads returning a full
 * `QueryResult` (command / oid / fields / rowCount). The chokepoint's client is
 * modelled structurally as `{ query(text, params?) => { rows, rowCount } }`,
 * which is not assignable to those overloads even though it is the same object
 * at runtime. Both state machines read only `.rows` off the result (verified in
 * `runTransition` / `runReceivingLineTransition`), so the cast is sound — and
 * it is confined to this one helper rather than sprinkled through the cases.
 */
function asPgClient(client: SessionActionClient): Pick<PoolClient, 'query'> {
  return client as unknown as Pick<PoolClient, 'query'>;
}

// ─── dispatch ────────────────────────────────────────────────────────────────

export async function dispatchSessionAction(
  client: SessionActionClient,
  orgId: OrgId,
  kind: SessionActionKind,
  payload: Payload,
  actorStaffId: number | null,
): Promise<SessionActionOutcome> {
  const deps = makeWorkSessionDepsForClient(client);

  switch (kind) {
    // ── lifecycle ────────────────────────────────────────────────────────────
    case 'work_session.start': {
      const sessionKind = stringField(payload, 'kind');
      if (sessionKind !== 'scan' && sessionKind !== 'task') {
        return { ok: false, status: 400, error: 'kind must be "scan" or "task"' };
      }
      const surfaceKey = stringField(payload, 'surfaceKey');
      const deviceId = stringField(payload, 'deviceId');
      const clientEventId = stringField(payload, 'clientEventId');
      const state = objectField(payload, 'state') ?? {};

      // The union is rebuilt here rather than cast, so a task payload carrying a
      // scanType cannot slip through — the same iff the DB CHECK and
      // `SurfaceSessionBinding` each state in their own language.
      const args =
        sessionKind === 'scan'
          ? (() => {
              const scanType = stringField(payload, 'scanType');
              if (!scanType || !isScanSessionType(scanType)) return null;
              return {
                orgId,
                kind: 'scan' as const,
                scanType,
                arm: boolField(payload, 'arm'),
                surfaceKey,
                staffId: actorStaffId,
                deviceId,
                clientEventId,
                state,
              };
            })()
          : {
              orgId,
              kind: 'task' as const,
              surfaceKey,
              staffId: actorStaffId,
              deviceId,
              clientEventId,
              state,
            };
      if (!args) {
        return { ok: false, status: 400, error: 'a scan session requires a known scanType' };
      }

      const started = await startSession(args, deps);
      if (!started.ok) return { ok: false, status: started.status, error: started.error };
      return {
        ok: true,
        targetRef: String(started.session.id),
        disposition: { reversibility: 'irreversible', reason: declaredReason(kind) },
      };
    }

    case 'work_session.arm': {
      const sessionId = intField(payload, 'sessionId');
      if (sessionId == null) return { ok: false, status: 400, error: 'sessionId is required' };
      const expectedVersion = optionalIntField(payload, 'expectedVersion') ?? undefined;

      const armed = await armScanSession({ orgId, sessionId, expectedVersion }, deps);
      if (!armed.ok) return { ok: false, status: armed.status, error: armed.error };
      if (armed.idempotent) {
        return {
          ok: true,
          targetRef: String(sessionId),
          disposition: { reversibility: 'irreversible', reason: NOTHING_CHANGED },
        };
      }

      // The wedge came from somewhere, and the index guarantees "somewhere" is
      // at most one session. Giving it back to that session is the true inverse;
      // when nothing held it, the inverse is to leave the tenant with none.
      const prior = armed.disarmedSessionIds.length > 0 ? armed.disarmedSessionIds[0] : null;
      return {
        ok: true,
        targetRef: String(sessionId),
        disposition: {
          reversibility: 'revertable',
          inverse:
            prior != null
              ? { kind: 'work_session.arm', payload: { sessionId: prior } }
              : { kind: 'work_session.disarm', payload: { sessionId } },
        },
      };
    }

    case 'work_session.disarm': {
      const sessionId = intField(payload, 'sessionId');
      if (sessionId == null) return { ok: false, status: 400, error: 'sessionId is required' };

      const disarmed = await disarmScanSessionOn(client, orgId, sessionId);
      if (!disarmed.ok) return { ok: false, status: disarmed.status, error: disarmed.error };
      return {
        ok: true,
        targetRef: String(sessionId),
        disposition: disarmed.idempotent
          ? { reversibility: 'irreversible', reason: NOTHING_CHANGED }
          : {
              reversibility: 'revertable',
              inverse: { kind: 'work_session.arm', payload: { sessionId } },
            },
      };
    }

    case 'work_session.park': {
      const sessionId = intField(payload, 'sessionId');
      if (sessionId == null) return { ok: false, status: 400, error: 'sessionId is required' };
      const expectedVersion = optionalIntField(payload, 'expectedVersion') ?? undefined;

      // Snapshot FIRST: park disarms as a side effect, so after the write there
      // is no way to learn whether this session held the wedge — and an unpark
      // that silently left the scanner dead is a half-undo.
      const before = await readWorkSessionForUpdate(client, orgId, sessionId);
      if (!before) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' };
      const wasArmed = before.armed;

      const parked = await parkSession({ orgId, sessionId, expectedVersion }, deps);
      if (!parked.ok) return { ok: false, status: parked.status, error: parked.error };
      return {
        ok: true,
        targetRef: String(sessionId),
        disposition: parked.idempotent
          ? { reversibility: 'irreversible', reason: NOTHING_CHANGED }
          : {
              reversibility: 'revertable',
              inverse: {
                kind: 'work_session.resume',
                payload: { sessionId, rearm: wasArmed },
              },
            },
      };
    }

    case 'work_session.resume': {
      const sessionId = intField(payload, 'sessionId');
      if (sessionId == null) return { ok: false, status: 400, error: 'sessionId is required' };
      const expectedVersion = optionalIntField(payload, 'expectedVersion') ?? undefined;
      const claimTtlSeconds = optionalIntField(payload, 'claimTtlSeconds') ?? undefined;
      const rearm = boolField(payload, 'rearm');

      const before = await readWorkSessionForUpdate(client, orgId, sessionId);
      if (!before) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' };
      const wasParked = before.status === 'parked';

      const resumed = await resumeSession(
        {
          orgId,
          sessionId,
          staffId: actorStaffId,
          deviceId: stringField(payload, 'deviceId'),
          claimTtlSeconds,
          expectedVersion,
        },
        deps,
      );
      if (!resumed.ok) return { ok: false, status: resumed.status, error: resumed.error };

      // `rearm` exists for exactly one caller: the inverse of a park that took
      // the wedge. resumeSession deliberately never arms on its own (arming
      // moves the wedge app-wide and a silent steal is the surprise the
      // one-armed rule deletes), so the re-arm is a second, explicit act here.
      if (rearm && resumed.session.kind === 'scan') {
        const rearmed = await armScanSession({ orgId, sessionId }, deps);
        if (!rearmed.ok) return { ok: false, status: rearmed.status, error: rearmed.error };
      }

      return {
        ok: true,
        targetRef: String(sessionId),
        disposition: wasParked
          ? {
              reversibility: 'revertable',
              inverse: { kind: 'work_session.park', payload: { sessionId } },
            }
          : {
              reversibility: 'irreversible',
              reason:
                'This renewed an edit lease rather than unparking a session. The previous lease had already expired or been taken, so there is nothing to restore.',
            },
      };
    }

    case 'work_session.end': {
      const sessionId = intField(payload, 'sessionId');
      if (sessionId == null) return { ok: false, status: 400, error: 'sessionId is required' };
      const expectedVersion = optionalIntField(payload, 'expectedVersion') ?? undefined;

      const ended = await endSession({ orgId, sessionId, expectedVersion }, deps);
      if (!ended.ok) return { ok: false, status: ended.status, error: ended.error };
      return {
        ok: true,
        targetRef: String(sessionId),
        disposition: {
          reversibility: 'irreversible',
          reason: ended.idempotent ? NOTHING_CHANGED : declaredReason(kind),
        },
      };
    }

    case 'work_session.set_state': {
      const sessionId = intField(payload, 'sessionId');
      if (sessionId == null) return { ok: false, status: 400, error: 'sessionId is required' };
      const next = objectField(payload, 'state');
      if (!next) return { ok: false, status: 400, error: 'state must be a JSON object' };

      const replaced = await replaceSessionStateOn(client, orgId, sessionId, next);
      if (!replaced.ok) return { ok: false, status: replaced.status, error: replaced.error };
      return {
        ok: true,
        targetRef: String(sessionId),
        disposition: {
          reversibility: 'revertable',
          // The whole prior document, written back whole. See
          // replaceSessionStateOn for why a merge inverse would be wrong.
          inverse: {
            kind: 'work_session.set_state',
            payload: { sessionId, state: replaced.priorState },
          },
        },
      };
    }

    // ── domain writes inside a session ───────────────────────────────────────
    case 'inventory.transition': {
      const unitId = intField(payload, 'unitId');
      if (unitId == null) return { ok: false, status: 400, error: 'unitId is required' };
      const to = stringField(payload, 'to');
      if (!to || !(SERIAL_STATES as readonly string[]).includes(to)) {
        return { ok: false, status: 400, error: `unknown serial state "${to ?? ''}"` };
      }
      const eventType = stringField(payload, 'eventType');
      if (!eventType) return { ok: false, status: 400, error: 'eventType is required' };
      const expectedFrom = stringField(payload, 'expectedFrom');
      if (expectedFrom && !(SERIAL_STATES as readonly string[]).includes(expectedFrom)) {
        return { ok: false, status: 400, error: `unknown serial state "${expectedFrom}"` };
      }

      const result = await transition(
        {
          session: NO_SESSION,
          unitId,
          to: to as SerialState,
          // `InventoryEventType` is a bare TS union with no runtime mirror to
          // validate against, and `inventory_events.event_type` is TEXT with the
          // vocabulary in a column comment. A narrowing cast is the honest
          // shape: we check it is a non-empty string and let the state machine's
          // own guard reject an edge it does not model.
          eventType: eventType as InventoryEventType,
          actorStaffId,
          station: (stringField(payload, 'station') as InventoryEventStation | null) ?? null,
          clientEventId: stringField(payload, 'clientEventId'),
          notes: stringField(payload, 'notes'),
          expectedFrom: (expectedFrom as SerialState | null) ?? undefined,
          // `binId` is the one passthrough where ABSENT and NULL mean different
          // things: transition() reads `input.binId !== undefined ? input.binId
          // : <derived from the unit's current_location>`, so always sending a
          // null would silently blank the bin on every event instead of letting
          // it default. Spread it only when the payload actually carried it.
          ...('binId' in payload ? { binId: optionalIntField(payload, 'binId') } : {}),
          prevBinId: optionalIntField(payload, 'prevBinId'),
          receivingId: optionalIntField(payload, 'receivingId'),
          receivingLineId: optionalIntField(payload, 'receivingLineId'),
          stockLedgerId: optionalIntField(payload, 'stockLedgerId'),
          scanToken: stringField(payload, 'scanToken'),
          payload: objectField(payload, 'payload') ?? {},
        },
        asPgClient(client),
        orgId,
      );
      if (!result.ok) return { ok: false, status: result.status, error: result.error };
      return {
        ok: true,
        targetRef: String(unitId),
        disposition: { reversibility: 'irreversible', reason: declaredReason(kind) },
      };
    }

    case 'receiving_line.transition': {
      const receivingLineId = intField(payload, 'receivingLineId');
      if (receivingLineId == null) {
        return { ok: false, status: 400, error: 'receivingLineId is required' };
      }
      const to = stringField(payload, 'to');
      if (!to) return { ok: false, status: 400, error: 'to is required' };

      const result = await transitionReceivingLine(
        {
          receivingLineId,
          to,
          expectedFrom: stringField(payload, 'expectedFrom') ?? undefined,
          actorStaffId,
          station: (stringField(payload, 'station') as InventoryEventStation | null) ?? null,
          clientEventId: stringField(payload, 'clientEventId'),
          notes: stringField(payload, 'notes'),
          eventType: (stringField(payload, 'eventType') as InventoryEventType | null) ?? undefined,
          strict: boolField(payload, 'strict'),
          payload: objectField(payload, 'payload') ?? {},
        },
        asPgClient(client),
        orgId,
      );
      if (!result.ok) return { ok: false, status: result.status, error: result.error };
      return {
        ok: true,
        targetRef: String(receivingLineId),
        disposition: {
          reversibility: 'irreversible',
          reason: result.changed ? declaredReason(kind) : NOTHING_CHANGED,
        },
      };
    }
  }
}
