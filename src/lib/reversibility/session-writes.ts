/**
 * Session writes, run on the CALLER'S transaction.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 *
 * Every function in `@/lib/sessions/work-sessions` opens its own
 * `withTenantTransaction`. That is exactly right for a route handler and
 * exactly wrong inside `applyAgentMutation`, which is already holding an open
 * tenant transaction when it dispatches. A nested `withTenantTransaction` would
 * take a second connection, commit on its own, and leave the domain write
 * committed while the `agent_mutations` row it belongs to could still roll
 * back — a change with no ledger row: invisible to the Process tool and
 * impossible to undo. The photo lane hit this first and solved it the same way
 * (`makeReassignDepsForClient`, reassign-receiving-photo.ts:13, "gets one
 * transaction instead of four").
 *
 * So this module does two things and nothing else:
 *
 *   1. {@link makeWorkSessionDepsForClient} — hands `work-sessions.ts` a
 *      `withTenantTransaction` that is really "run right here, on my client".
 *      No copy of its logic, no fork: the ONE implementation of park / resume /
 *      end / arm keeps owning the invariants, it just borrows our transaction.
 *      The GUC is already set on this client by the outer wrapper.
 *
 *   2. The two writes `work-sessions.ts` does not have — {@link disarmScanSessionOn}
 *      and {@link replaceSessionStateOn} — plus the pre-write snapshot the
 *      chokepoint needs to capture an inverse.
 *
 * Those two live HERE rather than in `work-sessions.ts` only because they were
 * written in a different lane. Fold them in; nothing about them is
 * reversibility-specific. (The session audit vocabulary already made that trip
 * — it is `AUDIT_ACTION.WORK_SESSION_*` in `audit-logs.ts` now.)
 *
 * ── NOT A CLIENT MODULE ─────────────────────────────────────────────────────
 *
 * Imports `work-sessions.ts`, which reaches `@/lib/tenancy/db`. The Process
 * tool's UI imports `./types` and `./action-kinds` (both pure) and never this.
 */

import { safeRandomUUID } from '@/lib/safe-uuid';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  mapWorkSession,
  type WorkSessionDeps,
} from '@/lib/sessions/work-sessions';
import type { WorkSession } from '@/lib/sessions/types';

/**
 * The narrow slice of a pg client this module uses. Structurally identical to
 * `FeedWriteClient` / `DraftGraphClient`, so the chokepoint's own client
 * satisfies it without a cast.
 */
export interface SessionActionClient {
  query(
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

const SESSION_COLUMNS = `
  id, organization_id, kind, scan_type, armed, surface_key, status, version,
  staff_id, claimed_by_staff_id, claim_expires_at, device_id, client_event_id,
  started_at, ended_at, state
`;

/**
 * Deps that make `work-sessions.ts` run on an ALREADY-OPEN transaction.
 *
 * `withTenantTransaction` here ignores the orgId it is handed and calls the
 * body with our client. That is not a shortcut — the outer
 * `withTenantTransaction` has already set `app.current_org` on this exact
 * connection (transaction-local), and every statement in `work-sessions.ts`
 * additionally carries an explicit `organization_id = $1` predicate with the
 * orgId its own caller passed. Re-entering the wrapper would set the same GUC
 * on a *different* connection, which is the bug, not the safety.
 */
export function makeWorkSessionDepsForClient(client: SessionActionClient): WorkSessionDeps {
  return {
    withTenantTransaction: (_orgId, fn) => fn(client),
    newClientEventId: safeRandomUUID,
  };
}

/**
 * Read one session under a row lock, before the write that is about to change
 * it. This snapshot IS the inverse: park's undo needs to know whether the
 * session was armed, resume's undo needs to know whether it was parked, and
 * set_state's undo needs the whole prior document.
 *
 * `FOR UPDATE` because the chokepoint is going to write this row in the same
 * transaction, and a snapshot taken without the lock can be stale by the time
 * the inverse is stored — which would record an undo that restores a state the
 * session was never in.
 */
export async function readWorkSessionForUpdate(
  client: SessionActionClient,
  orgId: OrgId,
  sessionId: number,
): Promise<WorkSession | null> {
  const { rows } = await client.query(
    `SELECT ${SESSION_COLUMNS} FROM work_sessions
      WHERE organization_id = $1 AND id = $2
      FOR UPDATE`,
    [orgId, sessionId],
  );
  const row = rows[0];
  return row ? mapWorkSession(row) : null;
}

export type DisarmResult =
  | { ok: true; session: WorkSession; idempotent: boolean }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Release the wedge without parking or ending.
 *
 * The one-armed-scan rule is a partial unique index over the tenant column, so
 * DISARMING is the trivially safe half of the swap — it can only ever free the
 * slot. (Arming is the half that needs disarm-first ordering inside one
 * transaction; `armWithin` in work-sessions.ts owns that and this does not
 * duplicate it.)
 *
 * `version` is bumped like every other accepted mutation on this row, so a
 * client holding `version` sees the change and does not apply a stale event.
 */
export async function disarmScanSessionOn(
  client: SessionActionClient,
  orgId: OrgId,
  sessionId: number,
): Promise<DisarmResult> {
  const session = await readWorkSessionForUpdate(client, orgId, sessionId);
  if (!session) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' };
  if (session.kind !== 'scan') {
    return { ok: false, status: 409, error: 'ONLY_A_SCAN_SESSION_CAN_DISARM' };
  }
  if (!session.armed) return { ok: true, session, idempotent: true };

  const { rows } = await client.query(
    `UPDATE work_sessions
        SET armed = false, version = version + 1, updated_at = now()
      WHERE organization_id = $1 AND id = $2
      RETURNING ${SESSION_COLUMNS}`,
    [orgId, sessionId],
  );
  const row = rows[0];
  if (!row) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' };
  return { ok: true, session: mapWorkSession(row), idempotent: false };
}

export type ReplaceStateResult =
  | { ok: true; session: WorkSession; priorState: Record<string, unknown> }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Replace the session's `state` document wholesale, returning what was there.
 *
 * REPLACE, not merge — and the inverse is the reason. A shallow JSONB merge has
 * no inverse once a key has been removed: you cannot express "and delete the
 * key I added" as another merge, so an undo built on merge would silently leave
 * the key behind. Handing the whole prior document back is the only shape where
 * "undo" means what an operator thinks it means.
 *
 * Ended sessions are refused. Scratch on a finished session is not a live
 * buffer any more, and letting it move would make the ledger describe edits to
 * something the domain considers closed.
 */
export async function replaceSessionStateOn(
  client: SessionActionClient,
  orgId: OrgId,
  sessionId: number,
  nextState: Record<string, unknown>,
): Promise<ReplaceStateResult> {
  const session = await readWorkSessionForUpdate(client, orgId, sessionId);
  if (!session) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' };
  if (session.status === 'ended') {
    return { ok: false, status: 409, error: 'SESSION_ALREADY_ENDED' };
  }

  const { rows } = await client.query(
    `UPDATE work_sessions
        SET state = $3::jsonb, version = version + 1, updated_at = now()
      WHERE organization_id = $1 AND id = $2
      RETURNING ${SESSION_COLUMNS}`,
    [orgId, sessionId, JSON.stringify(nextState ?? {})],
  );
  const row = rows[0];
  if (!row) return { ok: false, status: 404, error: 'SESSION_NOT_FOUND' };
  return { ok: true, session: mapWorkSession(row), priorState: session.state };
}
