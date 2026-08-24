/**
 * applyAgentMutation — the single reversible write chokepoint (universal-feed
 * plan §2.6 / §6; Warehouse-OS 04-roadmap Phase 8).
 *
 * It began as the AI-only write path and is now the write path for OPERATOR
 * session actions too, because it is the only place in this repo that captures
 * an INVERSE. Two actors, two kind registries, ONE LEDGER — which is the whole
 * point: the Process tool asks "what happened in this session and what can I
 * undo" and gets one answer, instead of reconciling an agent trail against a
 * parallel operator undo stack that would inevitably disagree with it.
 *
 * ── THE TWO ACTORS ──────────────────────────────────────────────────────────
 *
 *   agent    — kinds from MUTATION_KINDS. Trust class decides how it lands:
 *     • auto         — view-layer projection kinds; applied immediately, no
 *                      review (feed_membership.set_state, staff_rail_exclusion.*,
 *                      entity_signal.insert, node_surface.set_config).
 *     • draft_scoped — workflow DRAFT edits; applied immediately to the draft
 *                      (the draft IS the safety layer, publish stays the human
 *                      gate). Revertable.
 *     • review       — masters / live definitions (staff.create, reason_code.*,
 *                      setting.*); NEVER applied here — lands as
 *                      status='proposed' for a human to apply.
 *
 *   operator — kinds from SESSION_ACTION_KINDS (@/lib/reversibility). ALWAYS
 *     applied, never queued: there is no review gate for a thing a person is
 *     already permitted to do by hand, and the route's `withAuth` already
 *     decided that. The row exists so the action can be SHOWN and UNDONE.
 *
 * Keeping them apart in the ledger is not bookkeeping. `getMutationTrustStats`
 * measures the AI's acceptance rate to justify widening a kind's trust class;
 * if a human undoing their own park counted as an AI proposal being reverted,
 * that number would measure the wrong population and the widening decision
 * would be made on corrupted evidence.
 *
 * ── EVERY APPLY ANSWERS "CAN THIS BE UNDONE" ────────────────────────────────
 *
 * Dispatch no longer returns a nullable inverse; it returns an
 * {@link ActionDisposition}, which is either an inverse descriptor or a REASON
 * there is none. A null inverse used to mean two different things — "append-only
 * by nature" and "nobody wrote an inverse for this yet" — and the Process tool
 * cannot tell an operator which one they are looking at from a null. Now it can.
 *
 * Every APPLY runs one guarded write + the agent_mutations/affects rows in ONE
 * tenant transaction; recordAudit + ops_event + Ably fire post-commit,
 * best-effort.
 *
 * Deps-injected (default = real impls) so unit tests run DB-free.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { recordOpsEvent } from '@/lib/ops-events';
import { parseAttribution } from '@/lib/sessions/attribution';
import { publishAssistantMutation } from '@/lib/realtime/publish';
import {
  declaredIrreversibleReason,
  isActionKind,
  isSessionActionKind,
  resolveActionKind,
} from '@/lib/reversibility/action-kinds';
import { dispatchSessionAction } from '@/lib/reversibility/session-dispatch';
import type {
  ActionDisposition,
  ActorKind,
  MutationActor,
  PartialSessionRef,
  ReversibilityClass,
} from '@/lib/reversibility/types';

/** recordAudit's first param type (the local Queryable is unexported). */
type AuditDb = Parameters<typeof recordAudit>[0];
import {
  isMutationKind,
  mutationTrustClass,
  type MutationKind,
  type MutationTrustClass,
} from '@/lib/surfaces/registry';
import {
  createNodeSurface,
  deleteNodeSurface,
  insertStaffRailExclusion,
  deleteStaffRailExclusion,
  setFeedMembershipState,
  setNodeSurfaceConfig,
  type FeedWriteClient,
  type FeedWriteInverse,
} from '@/lib/surfaces/feed-writes';
import { recordEntitySignal } from '@/lib/surfaces/record-entity-signal';
import {
  PhotoReassignError,
  makeReassignDepsForClient,
  reassignReceivingPhoto,
  type ReassignClient,
} from '@/lib/photos/reassign-receiving-photo';
import { normalizeReassignPayload } from './reassign-payload';
import {
  draftAddEdge,
  draftAddNode,
  draftRemoveEdge,
  draftRemoveNode,
  draftReplaceNodeConfig,
  draftRestoreNode,
  draftSetAnnotations,
  draftUpdateNodeConfig,
  type DraftGraphClient,
  type DraftGraphInverse,
} from '@/lib/workflow/draft-graph-writes';

type Client = FeedWriteClient & DraftGraphClient;
type Payload = Record<string, unknown>;
type Inverse = { kind: string; payload: Payload } | null;

/**
 * Operator actions carry no trust class — they were performed by a person
 * through a surface that already checked their permission, so "how much do we
 * trust this to land unreviewed" is not a question about them. `'operator'`
 * says that plainly rather than borrowing `'auto'`, which would file them in
 * the AI's trust statistics.
 */
export type ApplyTrust = MutationTrustClass | 'operator';

export interface ApplyAgentMutationInput {
  organizationId: OrgId;
  mutationKind: string;
  payload: Payload;
  /**
   * WHO. Optional, and deliberately so.
   *
   * The house pattern for a migration like this is a required prop with no
   * default, so the compiler names every unmigrated call site. That is the
   * right tool when the existing call sites are WRONG. Here they are not: every
   * current caller is the assistant, `{ kind: 'agent' }` is what they mean, and
   * forcing an edit at each one would be churn with no defect behind it. Omit
   * it and the legacy `proposedByStaffId` / `aiChatSessionId` fields below are
   * read as exactly that agent actor.
   *
   * Pass it for anything that is not the assistant. An operator action MUST
   * pass it — there is no way to express "a human did this" through the legacy
   * fields, which is the gap this whole change closes.
   */
  actor?: MutationActor;
  /** Legacy agent shape. Ignored when `actor` is supplied. */
  proposedByStaffId?: number | null;
  /** Legacy agent shape. Ignored when `actor` is supplied. */
  aiChatSessionId?: string | null;
}

export type ApplyAgentMutationResult =
  | {
      ok: true;
      status: 'applied' | 'proposed';
      mutationId: number;
      trust: ApplyTrust;
      targetRef: string | null;
      /** What the ledger recorded about undoing this. */
      reversibility: ReversibilityClass;
      /** Present iff `reversibility === 'irreversible'`. */
      irreversibleReason: string | null;
    }
  | { ok: false; status: 400 | 404 | 409; error: string };

export interface AgentMutationSideEffects {
  organizationId: OrgId;
  mutationId: number;
  /**
   * Widened from `MutationKind` to `string` when operator kinds joined the
   * ledger. The side-effect payloads (audit metadata, ops_event payload, Ably
   * frame) all carry it as an opaque label, so nothing downstream had to narrow
   * it in the first place.
   */
  mutationKind: string;
  action: string;
  actorStaffId: number | null;
  actorKind: ActorKind;
  /**
   * The work session this happened inside, for the ops_event.
   *
   * Written to the `ops_events.session_id` / `session_type` COLUMNS
   * (2026-08-23b), not into the payload. The distinction is not cosmetic: the
   * manager rollup index is `(organization_id, session_id, occurred_at)`, and a
   * JSONB payload key cannot be used by it — every "what happened at this bench
   * this shift" query would have been a full scan.
   *
   * `session_type` is denormalized beside the id on purpose. `ON DELETE SET
   * NULL` clears `session_id` when a session row goes, and the fact of WHICH
   * BENCH the work happened at has to outlive the session that hosted it.
   */
  session: PartialSessionRef | null;
  targetRef: string | null;
  db: AuditDb;
}

export interface ApplyAgentMutationDeps {
  runTransaction: <T>(orgId: OrgId, fn: (client: Client) => Promise<T>) => Promise<T>;
  /** Post-commit audit + ops_event + Ably. Overridable/no-op in tests. */
  sideEffects: (e: AgentMutationSideEffects) => Promise<void>;
}

type DispatchOk = { ok: true; disposition: ActionDisposition; targetRef: string | null };
type DispatchErr = { ok: false; status: 400 | 404 | 409; error: string };
type DispatchResult = DispatchOk | DispatchErr;

/**
 * Fallback wording for an AI kind that captured no inverse and has no declared
 * reason in the registry. Deliberately not "cannot be undone" full stop — it
 * says WHICH of the two null-inverse meanings this is, which is the distinction
 * an operator staring at a locked button actually needs.
 */
const NO_INVERSE_CAPTURED =
  'This change did not record an inverse, so there is nothing to replay backwards. Reverse it by hand.';

/** Fold a legacy nullable inverse into the disposition every apply now returns. */
function dispositionFromInverse(kind: string, inverse: Inverse): ActionDisposition {
  if (inverse) return { reversibility: 'revertable', inverse };
  return {
    reversibility: 'irreversible',
    reason: declaredIrreversibleReason(kind) ?? NO_INVERSE_CAPTURED,
  };
}

/**
 * One guarded write per kind → its disposition + target ref, or an error.
 *
 * Operator (session) kinds are dispatched first and delegate wholesale to
 * `dispatchSessionAction`, which runs on THIS client — same transaction, so the
 * domain write and its ledger row commit together or not at all. Everything
 * below is the original AI dispatch, unchanged except that each arm's nullable
 * inverse is folded into a disposition on the way out.
 */
async function dispatchApply(
  client: Client,
  orgId: OrgId,
  kind: string,
  payload: Payload,
  actorStaffId: number | null,
): Promise<DispatchResult> {
  if (isSessionActionKind(kind)) {
    return dispatchSessionAction(client, orgId, kind, payload, actorStaffId);
  }
  if (!isMutationKind(kind)) {
    return { ok: false, status: 400, error: `no apply path for mutation kind "${kind}"` };
  }
  return dispatchAgentApply(client, orgId, kind, payload);
}

async function dispatchAgentApply(
  client: Client,
  orgId: OrgId,
  kind: MutationKind,
  payload: Payload,
): Promise<DispatchResult> {
  const p = payload;
  const ok = (inverse: Inverse, targetRef: string | null): DispatchOk => ({
    ok: true,
    disposition: dispositionFromInverse(kind, inverse),
    targetRef,
  });
  switch (kind) {
    case 'staff_rail_exclusion.insert': {
      const r = await insertStaffRailExclusion(client, orgId, p as never);
      return r.ok
        ? ok(r.inverse as Inverse, r.entityId != null ? String(r.entityId) : null)
        : { ok: false, status: 400, error: r.error ?? 'invalid' };
    }
    case 'staff_rail_exclusion.delete': {
      const r = await deleteStaffRailExclusion(client, orgId, p as never);
      return r.ok
        ? ok(r.inverse as Inverse, r.entityId != null ? String(r.entityId) : null)
        : { ok: false, status: 400, error: r.error ?? 'invalid' };
    }
    case 'feed_membership.set_state': {
      const r = await setFeedMembershipState(client, orgId, p as never);
      return r.ok
        ? ok(r.inverse as Inverse, r.entityId != null ? String(r.entityId) : null)
        : { ok: false, status: 404, error: r.error ?? 'invalid' };
    }
    case 'entity_signal.insert': {
      // Append-only fact — the signal IS the action, so a validation/DB failure
      // must surface (unlike the fire-and-forget chokepoint taps). The
      // SAVEPOINT inside recordEntitySignal keeps a DB error from poisoning
      // this tx. Never revertable.
      const sig = await recordEntitySignal(
        {
          ...(p as Record<string, unknown>),
          organizationId: orgId,
          client,
        } as unknown as Parameters<typeof recordEntitySignal>[0],
      );
      if (!sig.ok) return { ok: false, status: 400, error: sig.error };
      return ok(null, sig.id != null ? String(sig.id) : null);
    }
    case 'receiving_photo.reassign': {
      const norm = normalizeReassignPayload(p);
      if (!norm.ok) return { ok: false, status: 400, error: norm.error };

      // ALL-OR-NOTHING, on purpose. Every move runs on this transaction's
      // client, so a failure on move 4 of 7 rolls back moves 1-3 too. The
      // alternative — best-effort with a partial report — leaves an operator
      // diffing a carton by hand to work out which photos actually moved, and
      // a half-applied change cannot be cleanly reverted by a single inverse.
      // Refusing with the reason beats silently doing most of it.
      const undo: Array<{ photoId: number; targetEntityType: string; targetEntityId: number }> = [];
      const deps = makeReassignDepsForClient(client as unknown as ReassignClient);
      try {
        for (const move of norm.moves) {
          const r = await reassignReceivingPhoto(
            {
              organizationId: orgId,
              photoId: move.photoId,
              targetEntityType: move.targetEntityType,
              targetEntityId: move.targetEntityId,
            },
            deps,
          );
          // Each photo's OWN prior home — a batch's photos can come from
          // different places, which is exactly why the inverse is a list.
          undo.push({
            photoId: move.photoId,
            targetEntityType: r.from.entityType,
            targetEntityId: r.from.entityId,
          });
        }
      } catch (err) {
        if (err instanceof PhotoReassignError) {
          return {
            ok: false,
            status: err.status,
            error:
              norm.moves.length > 1
                ? `${err.message} (no photos were moved — the whole change was rolled back)`
                : err.message,
          };
        }
        throw err;
      }

      return ok(
        { kind: 'receiving_photo.reassign', payload: { moves: undo } },
        // One target ref for a single move; the batch is described by the
        // mutation payload itself.
        undo.length === 1 ? String(undo[0]!.photoId) : `${undo.length} photos`,
      );
    }
    case 'node_surface.set_config': {
      const r = await setNodeSurfaceConfig(client, orgId, p as never);
      return feedToDispatch(kind, r);
    }
    case 'node_surface.create': {
      const r = await createNodeSurface(client, orgId, p as never);
      return feedToDispatch(kind, r);
    }
    case 'node_surface.delete': {
      const r = await deleteNodeSurface(client, orgId, p as never);
      return feedToDispatch(kind, r);
    }
    case 'workflow_draft.add_node':
      return draftToDispatch(kind, await draftAddNode(client, orgId, p as never));
    case 'workflow_draft.remove_node':
      return draftToDispatch(kind, await draftRemoveNode(client, orgId, p as never));
    case 'workflow_draft.restore_node' as MutationKind:
      return draftToDispatch(kind, await draftRestoreNode(client, orgId, p as never));
    case 'workflow_draft.update_node_config':
      return draftToDispatch(kind, await draftUpdateNodeConfig(client, orgId, p as never));
    case 'workflow_draft.replace_node_config' as MutationKind:
      return draftToDispatch(kind, await draftReplaceNodeConfig(client, orgId, p as never));
    case 'workflow_draft.add_edge':
      return draftToDispatch(kind, await draftAddEdge(client, orgId, p as never));
    case 'workflow_draft.remove_edge':
      return draftToDispatch(kind, await draftRemoveEdge(client, orgId, p as never));
    case 'workflow_draft.set_annotations':
      return draftToDispatch(kind, await draftSetAnnotations(client, orgId, p as never));
    default:
      // review-class kinds never reach dispatchApply; anything else is a gap.
      return { ok: false, status: 400, error: `no apply path for mutation kind "${kind}"` };
  }
}

function feedToDispatch(
  kind: MutationKind,
  r: { ok: boolean; error?: string; status?: 400 | 404 | 409; inverse: FeedWriteInverse; entityId?: number },
): DispatchResult {
  return r.ok
    ? {
        ok: true,
        disposition: dispositionFromInverse(kind, r.inverse as Inverse),
        targetRef: r.entityId != null ? String(r.entityId) : null,
      }
    : { ok: false, status: (r.status ?? 400) as 400 | 404 | 409, error: r.error ?? 'invalid' };
}

function draftToDispatch(
  kind: MutationKind,
  r: { ok: boolean; error?: string; status?: 400 | 404 | 409 | 422; inverse: DraftGraphInverse; targetRef?: string },
): DispatchResult {
  return r.ok
    ? {
        ok: true,
        disposition: dispositionFromInverse(kind, r.inverse as Inverse),
        targetRef: r.targetRef ?? null,
      }
    : { ok: false, status: (r.status === 422 ? 400 : r.status ?? 400) as 400 | 404 | 409, error: r.error ?? 'invalid' };
}

const defaultDeps: ApplyAgentMutationDeps = {
  runTransaction: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client as unknown as Client)),
  sideEffects: defaultSideEffects,
};

async function defaultSideEffects(e: AgentMutationSideEffects): Promise<void> {
  try {
    await recordAudit(e.db, null, null, {
      // The source names the ACTOR, not the module. An operator's park landing
      // in audit_logs under 'assistant.mutation' would be actively misleading to
      // anyone reading the compliance trail — which is the one thing that table
      // is unambiguously for.
      source: e.actorKind === 'operator' ? 'operator.session' : 'assistant.mutation',
      action: e.action,
      entityType: AUDIT_ENTITY.AGENT_MUTATION,
      entityId: e.mutationId,
      method: 'system',
      actorStaffIdOverride: e.actorStaffId,
      organizationIdOverride: e.organizationId,
      extra: {
        mutationKind: e.mutationKind,
        targetRef: e.targetRef,
        actorKind: e.actorKind,
        ...(e.session ? { workSessionId: e.session.workSessionId, sessionType: e.session.sessionType } : {}),
      },
    });
  } catch (err) {
    console.warn('[agent-mutation] audit failed (non-fatal):', err);
  }
  try {
    await recordOpsEvent({
      organizationId: e.organizationId,
      entityType: 'other',
      entityId: e.mutationId,
      eventType: e.action,
      actorStaffId: e.actorStaffId,
      clientEventId: `agent-mutation:${e.mutationId}:${e.action}`,
      // COLUMNS, not payload. They ride as real columns since 2026-08-23b, which
      // is what lets the manager rollup index `(organization_id, session_id,
      // occurred_at)` be used at all — a JSONB payload key cannot be indexed by
      // that rollup and every "what happened at this bench this shift" query
      // would have been a full scan.
      //
      // `parseAttribution` rather than a literal, because `e.session` is a
      // PartialSessionRef whose `sessionType` may be null (the revert path holds
      // the id but would need a fresh read purely to decorate the label). It
      // keeps the id and degrades the type, so the event still lands in its
      // session's contents; an unrecognised type string is dropped rather than
      // stored, so a typo cannot invent a bench in the grouped rollup.
      session: parseAttribution({
        sessionId: e.session?.workSessionId,
        sessionType: e.session?.sessionType,
      }),
      payload: {
        mutationKind: e.mutationKind,
        targetRef: e.targetRef,
        actorKind: e.actorKind,
      },
    });
  } catch (err) {
    console.warn('[agent-mutation] ops_event failed (non-fatal):', err);
  }
  try {
    await publishAssistantMutation({
      organizationId: e.organizationId,
      mutationId: e.mutationId,
      mutationKind: e.mutationKind,
      action: e.action,
      targetRef: e.targetRef,
    });
  } catch (err) {
    console.warn('[agent-mutation] realtime publish failed (non-fatal):', err);
  }
}

export async function applyAgentMutation(
  input: ApplyAgentMutationInput,
  deps: ApplyAgentMutationDeps = defaultDeps,
): Promise<ApplyAgentMutationResult> {
  if (!input.organizationId) return { ok: false, status: 400, error: 'organizationId is required' };
  const resolvedKind = resolveActionKind(input.mutationKind);
  if (!resolvedKind) {
    return { ok: false, status: 400, error: `unknown mutation kind "${input.mutationKind}"` };
  }
  const kind = input.mutationKind;

  // Absent `actor` means the legacy agent shape. See ApplyAgentMutationInput.
  const actor: MutationActor = input.actor ?? {
    kind: 'agent',
    staffId: input.proposedByStaffId ?? null,
    aiChatSessionId: input.aiChatSessionId ?? null,
  };
  const actorKind: ActorKind = actor.kind;
  const actorStaffId = actor.staffId;
  const aiChatSessionId = actor.kind === 'agent' ? actor.aiChatSessionId : null;
  const session = actor.kind === 'operator' ? actor.session : null;

  // An operator kind reached through the agent path (or vice versa) is a wiring
  // mistake, and the two vocabularies have different meanings — an "auto" trust
  // class on an operator action would feed the AI's acceptance stats. Refuse
  // rather than guess which one the caller meant.
  if (resolvedKind.registry === 'session_action' && actor.kind !== 'operator') {
    return { ok: false, status: 400, error: `"${kind}" is an operator action and requires an operator actor` };
  }
  if (resolvedKind.registry === 'mutation' && actor.kind === 'operator') {
    return { ok: false, status: 400, error: `"${kind}" is an agent mutation kind and cannot be applied as an operator action` };
  }

  const trust: ApplyTrust =
    resolvedKind.registry === 'session_action' ? 'operator' : mutationTrustClass(kind as MutationKind);
  const payload = input.payload ?? {};

  // ── review-class: propose only, never apply ────────────────────────────────
  // Unreachable for operator kinds — they carry no trust class and the guard
  // above already refused the mismatch.
  if (trust === 'review') {
    const outcome = await deps.runTransaction(input.organizationId, async (client) => {
      const row = await client.query(
        `INSERT INTO agent_mutations
           (organization_id, proposed_by_staff_id, ai_chat_session_id, status, mutation_kind, payload,
            actor_kind, work_session_id, reversibility)
         VALUES ($1, $2, $3, 'proposed', $4, $5::jsonb, $6, $7, 'unknown')
         RETURNING id`,
        [
          input.organizationId,
          actorStaffId,
          aiChatSessionId,
          kind,
          JSON.stringify(payload),
          actorKind,
          session?.workSessionId ?? null,
        ],
      );
      const mutationId = Number(row.rows[0].id);
      await insertAffects(client, input.organizationId, mutationId, resolvedKind.targetKind, null);
      return mutationId;
    });
    await deps.sideEffects({
      organizationId: input.organizationId,
      mutationId: outcome,
      mutationKind: kind,
      action: AUDIT_ACTION.AGENT_MUTATION_PROPOSE,
      actorStaffId,
      actorKind,
      session,
      targetRef: null,
      db: poolDb(deps),
    });
    return {
      ok: true,
      status: 'proposed',
      mutationId: outcome,
      trust,
      targetRef: null,
      // A proposal applied nothing, so it is not 'irreversible' either — that
      // word is about a change that HAPPENED. It stays 'unknown' until (and if)
      // a human applies it, at which point the apply path classifies it.
      reversibility: 'unknown',
      irreversibleReason: null,
    };
  }

  // ── auto / draft_scoped / operator: apply in one tx ────────────────────────
  type ApplyOutcome =
    | { failed: ApplyAgentMutationResult & { ok: false } }
    | { failed: null; mutationId: number; targetRef: string | null; disposition: ActionDisposition };
  const outcome: ApplyOutcome = await deps.runTransaction(input.organizationId, async (client): Promise<ApplyOutcome> => {
    const applied = await dispatchApply(client, input.organizationId, kind, payload, actorStaffId);
    if (!applied.ok) return { failed: { ok: false, status: applied.status, error: applied.error } };

    const disposition = applied.disposition;
    const inverse = disposition.reversibility === 'revertable' ? disposition.inverse : null;
    const irreversibleReason = disposition.reversibility === 'irreversible' ? disposition.reason : null;

    const row = await client.query(
      `INSERT INTO agent_mutations
         (organization_id, proposed_by_staff_id, ai_chat_session_id, status, mutation_kind, payload,
          applied_by, applied_at, extra_audit, actor_kind, work_session_id, reversibility)
       VALUES ($1, $2, $3, 'applied', $4, $5::jsonb, $2, NOW(), $6::jsonb, $7, $8, $9)
       RETURNING id`,
      [
        input.organizationId,
        actorStaffId,
        aiChatSessionId,
        kind,
        JSON.stringify(payload),
        // `inverse` keeps its exact shape and position — revertAgentMutation
        // reads extra_audit.inverse and every row ever written has it there.
        // The reason rides alongside as display text.
        JSON.stringify({ inverse, trust, irreversibleReason }),
        actorKind,
        session?.workSessionId ?? null,
        disposition.reversibility,
      ],
    );
    const mutationId = Number(row.rows[0].id);
    await insertAffects(client, input.organizationId, mutationId, resolvedKind.targetKind, applied.targetRef);
    return { failed: null, mutationId, targetRef: applied.targetRef, disposition };
  });

  if (outcome.failed) return outcome.failed;

  await deps.sideEffects({
    organizationId: input.organizationId,
    mutationId: outcome.mutationId,
    mutationKind: kind,
    action: AUDIT_ACTION.AGENT_MUTATION_APPLY,
    actorStaffId,
    actorKind,
    session,
    targetRef: outcome.targetRef,
    db: poolDb(deps),
  });
  return {
    ok: true,
    status: 'applied',
    mutationId: outcome.mutationId,
    trust,
    targetRef: outcome.targetRef,
    reversibility: outcome.disposition.reversibility,
    irreversibleReason:
      outcome.disposition.reversibility === 'irreversible' ? outcome.disposition.reason : null,
  };
}

// ─── revert ──────────────────────────────────────────────────────────────────

export interface RevertAgentMutationResult {
  ok: boolean;
  /** 403 = the actor may not revert this KIND (see MutationKindDef.permission). */
  status: 200 | 400 | 403 | 404 | 409;
  error?: string;
}

export async function revertAgentMutation(
  mutationId: number,
  orgId: OrgId,
  actorStaffId: number | null,
  deps: ApplyAgentMutationDeps = defaultDeps,
  /**
   * The actor's permissions. Optional ONLY so existing server-side callers
   * (review tooling) keep working; the assistant always passes it.
   *
   * Checked here rather than at the tool layer because the kind is not known
   * until the row is read — and someone able to APPLY a change must be able to
   * undo it, which a single blanket gate could not express.
   */
  actorPermissions?: ReadonlySet<string>,
): Promise<RevertAgentMutationResult> {
  const outcome = await deps.runTransaction(orgId, async (client) => {
    const row = await client.query(
      `SELECT status, mutation_kind, extra_audit, actor_kind, work_session_id, reversibility
         FROM agent_mutations
        WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
      [orgId, mutationId],
    );
    if (row.rows.length === 0) return { status: 404 as const, error: 'mutation not found' };
    const r = row.rows[0];
    if (r.status !== 'applied') return { status: 409 as const, error: `mutation is ${r.status}, only applied mutations revert` };
    const revertKind = String(r.mutation_kind);
    const revertDef = resolveActionKind(revertKind);
    if (actorPermissions && revertDef) {
      const need = revertDef.permission;
      if (!actorPermissions.has(need)) {
        return { status: 403 as const, error: `reverting "${revertKind}" requires ${need}` };
      }
    }
    const extra = (r.extra_audit ?? {}) as { inverse?: Inverse; irreversibleReason?: string | null };
    const inverse = extra.inverse ?? null;
    if (!inverse) {
      // Say WHY, using the reason recorded at apply time (or, for rows written
      // before the classifier, the kind's declared reason). "not revertable
      // (append-only or missing inverse)" made an operator guess which of two
      // very different situations they were in.
      const why = extra.irreversibleReason ?? declaredIrreversibleReason(revertKind) ?? NO_INVERSE_CAPTURED;
      return { status: 409 as const, error: why };
    }

    // Session inverses (`work_session.resume`, `work_session.arm`, …) are legal
    // inverse kinds now, so the guard asks both registries rather than
    // hard-coding the two families it used to know about. The `workflow_draft.`
    // prefix escape stays: two draft kinds are dispatched by string literal
    // (`restore_node`, `replace_node_config`) without registry entries.
    if (!isActionKind(inverse.kind) && !inverse.kind.startsWith('workflow_draft.')) {
      return { status: 400 as const, error: `unknown inverse kind "${inverse.kind}"` };
    }
    const applied = await dispatchApply(
      client,
      orgId,
      inverse.kind,
      inverse.payload,
      // The person clicking undo is the actor for the compensating write — an
      // inverse is a new domain write and it should be attributed to whoever
      // asked for it, not to whoever made the original change.
      actorStaffId,
    );
    if (!applied.ok) return { status: applied.status, error: applied.error };

    await client.query(
      `UPDATE agent_mutations SET status = 'reverted', updated_at = NOW() WHERE organization_id = $1 AND id = $2`,
      [orgId, mutationId],
    );
    // Carry the ORIGINAL mutation's kind + actor out so the side-effects (audit
    // / ops / Ably) classify the revert by what was reverted, not by the
    // inverse — and so an operator's undo is not filed as assistant activity.
    return {
      status: 200 as const,
      mutationKind: revertDef ? revertKind : null,
      actorKind: (String(r.actor_kind ?? 'agent') as ActorKind),
      workSessionId: r.work_session_id == null ? null : Number(r.work_session_id),
    };
  });

  if (outcome.status === 200) {
    await deps.sideEffects({
      organizationId: orgId,
      mutationId,
      mutationKind: outcome.mutationKind ?? 'entity_signal.insert',
      action: AUDIT_ACTION.AGENT_MUTATION_REVERT,
      actorStaffId,
      actorKind: outcome.actorKind,
      // The session TYPE is not on the ledger row (it lives on work_sessions and
      // on the ops_events the session emitted), and re-reading it here would put
      // a query in a post-commit best-effort path just to decorate a label. The
      // id is what a reader needs to find the session — hence PartialSessionRef.
      session:
        outcome.workSessionId != null
          ? { workSessionId: outcome.workSessionId, sessionType: null }
          : null,
      targetRef: null,
      db: poolDb(deps),
    });
  }
  return { ok: outcome.status === 200, status: outcome.status, error: outcome.error };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function insertAffects(
  client: Client,
  orgId: OrgId,
  mutationId: number,
  targetKind: string,
  targetRef: string | null,
): Promise<void> {
  if (!targetRef) return;
  await client.query(
    `INSERT INTO agent_mutation_affects (organization_id, agent_mutation_id, target_kind, target_ref, role_in_mutation)
     VALUES ($1, $2, $3, $4, 'primary')`,
    [orgId, mutationId, targetKind, `${targetKind}:entity:${targetRef}`],
  );
}

// The default sideEffects needs an audit db for recordAudit; the real one is
// the shared pool. Tests inject their own sideEffects and never call this.
function poolDb(deps: ApplyAgentMutationDeps): AuditDb {
  if (deps.sideEffects !== defaultSideEffects) {
    // Test path — sideEffects is overridden and won't touch db.
    return {} as AuditDb;
  }
  return (require('@/lib/db') as { default: AuditDb }).default;
}
