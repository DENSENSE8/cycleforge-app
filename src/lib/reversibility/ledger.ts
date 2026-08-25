/**
 * The Process tool's read: one session's actions, newest first, each with an
 * honest verdict on whether it can still be undone.
 *
 * ── ONE QUERY, ONE TABLE ────────────────────────────────────────────────────
 *
 * This reads `agent_mutations` and nothing else. That is the deliverable — the
 * Process tool must not become a fourteenth spine that has to be reconciled
 * against the thirteen `journey.ts` already unions. `agent_mutation_affects`
 * joins in only for the display ref, through a LATERAL that stops at the first
 * primary row.
 *
 * ── WHY THE READER RE-DERIVES REVERSIBILITY ─────────────────────────────────
 *
 * Rows written before 2026-08-23a carry `reversibility = 'unknown'` — the
 * column's default — and there are real ones in every deployed org. The
 * classifier did not exist when they were written, so the column cannot be
 * trusted to answer for them, but the ROW still can: `extra_audit.inverse` has
 * been captured on every applied mutation since the chokepoint shipped, and
 * `revertAgentMutation` has always resolved undoability by reading exactly
 * that. So the reader resolves 'unknown' the same way the reverter does,
 * instead of showing an operator a shrug.
 *
 * `canRevert` is a SEPARATE question and is computed here rather than in the
 * component. A revertable action that has already been reverted is still
 * revertable-in-kind and must not offer the button a second time; leaving each
 * renderer to re-derive that produces two subtly different answers eventually.
 *
 * Deps-injected (default `tenantQuery`) so it unit-tests DB-free, matching
 * `trust-stats.ts` next door.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { declaredIrreversibleReason, resolveActionKind } from './action-kinds';
import type { ActorKind, InverseDescriptor, ProcessLedgerEntry, ReversibilityClass } from './types';

export interface LedgerDeps {
  query: typeof tenantQuery;
}

const defaultDeps: LedgerDeps = { query: tenantQuery };

/**
 * A session is a shift's worth of work, not a year's. 200 is generous for the
 * list an operator actually scrolls, and it keeps one runaway session from
 * turning a tool open into a full-table read.
 */
export const PROCESS_LEDGER_LIMIT = 200;

const NO_INVERSE_CAPTURED =
  'This change did not record an inverse, so there is nothing to replay backwards. Reverse it by hand.';

interface LedgerRow {
  id: string | number;
  mutation_kind: string;
  status: string;
  actor_kind: string | null;
  proposed_by_staff_id: number | null;
  actor_name: string | null;
  reversibility: string | null;
  extra_audit: { inverse?: InverseDescriptor | null; irreversibleReason?: string | null } | null;
  created_at: string | Date | null;
  target_ref: string | null;
}

const LEDGER_SELECT = `
  SELECT m.id,
         m.mutation_kind,
         m.status,
         m.actor_kind,
         m.proposed_by_staff_id,
         s.name AS actor_name,
         m.reversibility,
         m.extra_audit,
         m.created_at,
         a.target_ref
    FROM agent_mutations m
    LEFT JOIN staff s
           ON s.id = m.proposed_by_staff_id
          AND s.organization_id = m.organization_id
    LEFT JOIN LATERAL (
      SELECT af.target_ref
        FROM agent_mutation_affects af
       WHERE af.organization_id = m.organization_id
         AND af.agent_mutation_id = m.id
       ORDER BY (af.role_in_mutation = 'primary') DESC, af.id
       LIMIT 1
    ) a ON true
`;

function toIso(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function isActorKind(v: string | null): v is ActorKind {
  return v === 'agent' || v === 'operator' || v === 'system';
}

/**
 * Turn one row into a list entry, resolving the two questions the column alone
 * cannot answer for legacy rows.
 */
export function toLedgerEntry(row: LedgerRow): ProcessLedgerEntry {
  const kind = String(row.mutation_kind);
  const def = resolveActionKind(kind);
  const extra = row.extra_audit ?? {};
  const inverse = extra.inverse ?? null;

  const stored = row.reversibility;
  const reversibility: ReversibilityClass =
    stored === 'revertable' || stored === 'irreversible'
      ? stored
      : // 'unknown' (or a NULL from a database that predates the column): fall
        // back to the same signal revertAgentMutation uses.
        inverse
        ? 'revertable'
        : 'irreversible';

  const irreversibleReason =
    reversibility === 'irreversible'
      ? (extra.irreversibleReason ?? declaredIrreversibleReason(kind) ?? NO_INVERSE_CAPTURED)
      : null;

  return {
    id: Number(row.id),
    kind,
    // An unrecognized kind renders as its raw string rather than blanking the
    // row. A row written by a newer deploy is still a thing that happened.
    label: def?.label ?? kind,
    actorKind: isActorKind(row.actor_kind) ? row.actor_kind : 'agent',
    actorStaffId: row.proposed_by_staff_id == null ? null : Number(row.proposed_by_staff_id),
    actorName: row.actor_name,
    status: String(row.status),
    reversibility,
    irreversibleReason,
    targetRef: row.target_ref,
    occurredAt: toIso(row.created_at),
    // Only an APPLIED row with a captured inverse can be undone. Both halves
    // matter: 'reverted' rows are already undone, 'proposed' rows never applied.
    canRevert: row.status === 'applied' && inverse != null,
  };
}

/** Everything this work session did, newest first. */
export async function readSessionLedger(
  orgId: OrgId,
  workSessionId: number,
  deps: LedgerDeps = defaultDeps,
): Promise<ProcessLedgerEntry[]> {
  const r = await deps.query<LedgerRow & Record<string, unknown>>(
    orgId,
    `${LEDGER_SELECT}
     WHERE m.organization_id = $1
       AND m.work_session_id = $2
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $3`,
    [orgId, workSessionId, PROCESS_LEDGER_LIMIT],
  );
  return r.rows.map(toLedgerEntry);
}

/**
 * One entry by id, org-scoped. The revert route reads this to tell an operator
 * what they are about to undo before it calls the chokepoint.
 */
export async function readLedgerEntry(
  orgId: OrgId,
  mutationId: number,
  deps: LedgerDeps = defaultDeps,
): Promise<ProcessLedgerEntry | null> {
  const r = await deps.query<LedgerRow & Record<string, unknown>>(
    orgId,
    `${LEDGER_SELECT}
     WHERE m.organization_id = $1
       AND m.id = $2`,
    [orgId, mutationId],
  );
  const row = r.rows[0];
  return row ? toLedgerEntry(row) : null;
}

export type DiscardLedgerEntryResult =
  | { ok: true; status: 200; mutationId: number }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Discard a PROPOSED entry — the Process tool's "delete".
 *
 * ── WHAT DELETE CANNOT MEAN HERE ────────────────────────────────────────────
 *
 * It cannot mean `DELETE FROM agent_mutations`. This table is the record of
 * what happened, it is the substrate `getMutationTrustStats` learns from, and
 * `agent_mutation_affects` cascades off it. An operator who "deleted" an applied
 * action would be left with a changed database and no trace of who changed it —
 * which is the failure mode the whole reversibility phase exists to prevent, not
 * a feature of it.
 *
 * So an APPLIED row is refused, with the reason, and the operator is pointed at
 * undo. What CAN be deleted is a proposal that never touched anything: it moves
 * to 'rejected', which is the status the schema already reserves for exactly
 * this (agent_mutations_status_chk, 2026-07-03o) and which trust-stats already
 * counts as a refusal.
 */
export async function discardLedgerEntry(
  orgId: OrgId,
  mutationId: number,
  deps: LedgerDeps = defaultDeps,
): Promise<DiscardLedgerEntryResult> {
  const current = await deps.query<{ status: string }>(
    orgId,
    `SELECT status FROM agent_mutations WHERE organization_id = $1 AND id = $2`,
    [orgId, mutationId],
  );
  const row = current.rows[0];
  if (!row) return { ok: false, status: 404, error: 'Action not found.' };
  if (row.status === 'applied') {
    return {
      ok: false,
      status: 409,
      error: 'This action changed something. Undo it instead — deleting the record would leave the change with no trace of who made it.',
    };
  }
  if (row.status === 'rejected') return { ok: true, status: 200, mutationId };
  if (row.status === 'reverted') {
    return { ok: false, status: 409, error: 'This action was already undone; its record stays.' };
  }

  await deps.query(
    orgId,
    `UPDATE agent_mutations
        SET status = 'rejected', updated_at = NOW()
      WHERE organization_id = $1 AND id = $2 AND status NOT IN ('applied', 'reverted')`,
    [orgId, mutationId],
  );
  return { ok: true, status: 200, mutationId };
}
