/**
 * Cross-entity urgency — the pure orchestration half.
 *
 * Split from its server binding (`promote-urgency.ts` / `promote-urgency-deps.ts`)
 * so the routing, the refusals, and the idempotency rules unit-test with zero
 * network and zero database — the same shape as `support/reply-persona.ts` +
 * `reply-persona-deps.ts` and `photos/analyze-core.ts` + `analyze.ts`
 * (Dependency injection for testability).
 *
 * ## What this is NOT
 *
 * It is **not** a wrapper around the three existing PATCH routes, and it must
 * not become one. `/api/orders/assign`, `PATCH /api/receiving-logs` and
 * `PATCH /api/zendesk/tickets/[id]` each write urgency as ONE COLUMN inside a
 * wider multi-field UPDATE. Routing that single field back out through here
 * would split one atomic write into two round trips that can half-fail, which
 * is strictly worse than the duplication it would remove.
 *
 * So those routes keep their inline column writes and are named, frozen
 * exceptions in `urgency-sot.guard.test.ts`. What the guard actually prevents
 * is a *fourth* single-purpose urgency writer appearing — which is how the
 * first three diverged.
 *
 * This module is the one entry point for the **cross-entity intent**: a caller
 * holding `(entityType, entityId)` that it did not choose — a resolved scan, a
 * thrown task, a bulk triage action — and wanting the record urgent without
 * knowing which of three storages that means.
 */

import {
  urgencyTarget,
  type UrgencyEntityType,
  type UrgencyLevel,
} from './urgency-targets';

/**
 * What a storage write reports back.
 *
 * `unchanged` is a distinct outcome from `updated` and not a convenience: the
 * caller fans out a notification, and re-promoting an already-urgent record
 * must not throw a second "this is urgent now" at the same operator. A boolean
 * would collapse the two and make double-sends invisible.
 */
export type UrgencyWriteOutcome = 'updated' | 'unchanged' | 'not_found';

export interface UrgencyWriteArgs {
  entityId: number;
  level: UrgencyLevel;
}

/**
 * One method per storage. Deliberately NOT a single `write(entityType, …)`:
 * a per-type method means adding a fourth record kind fails to compile at every
 * binding until it is implemented, rather than throwing at runtime on the first
 * operator who pastes one.
 */
export interface UrgencyDeps {
  setOrderUrgency(args: UrgencyWriteArgs): Promise<UrgencyWriteOutcome>;
  setCartonUrgency(args: UrgencyWriteArgs): Promise<UrgencyWriteOutcome>;
  setTicketUrgency(args: UrgencyWriteArgs): Promise<UrgencyWriteOutcome>;
}

export interface PromoteUrgencyInput {
  entityType: unknown;
  entityId: unknown;
  /** Defaults to `urgent` — the overwhelmingly common intent. */
  level?: UrgencyLevel;
}

/**
 * Every `ok: false` reason below is reachable — there is deliberately no
 * placeholder state. An unreachable union member is worse than a missing one,
 * because the next caller writes a branch for it and cannot tell that the
 * branch is dead.
 *
 * In particular, a receiving **line** that was never paired to a carton refuses
 * as `unsupported_entity` rather than under a reason of its own: it has no
 * `receiving_carton` row to carry `priority_tier`, so it genuinely cannot be
 * made urgent today. The UI already refuses it at `useReceivingLineCore.ts`
 * ("Link a PO first to set priority"); refusing in the domain too keeps a
 * caller that skips the UI from writing nothing and reporting success. That is
 * a real product gap, not a bug to route around.
 */
export type PromoteUrgencyResult =
  | {
      ok: true;
      entityType: UrgencyEntityType;
      entityId: number;
      level: UrgencyLevel;
      /** False when the record already sat at this level. See `UrgencyWriteOutcome`. */
      changed: boolean;
    }
  | {
      ok: false;
      reason: 'unsupported_entity' | 'invalid_entity_id' | 'not_found';
    };

/**
 * Promote (or clear) urgency on one record.
 *
 * Idempotent by construction — the bindings compare before they write, so
 * calling this twice reports `changed: false` the second time instead of
 * writing twice or throwing.
 */
export async function promoteUrgencyCore(
  input: PromoteUrgencyInput,
  deps: UrgencyDeps,
): Promise<PromoteUrgencyResult> {
  const target = urgencyTarget(input.entityType);
  if (!target) return { ok: false, reason: 'unsupported_entity' };

  const entityId = Number(input.entityId);
  // A non-finite or non-positive id is a caller bug, and every storage keys on
  // a positive integer. Refuse before touching the database rather than letting
  // `WHERE id = NaN` come back as a confusing "not found".
  if (!Number.isInteger(entityId) || entityId <= 0) {
    return { ok: false, reason: 'invalid_entity_id' };
  }

  const level: UrgencyLevel = input.level ?? 'urgent';
  const args: UrgencyWriteArgs = { entityId, level };

  const outcome = await writeFor(target.entityType, args, deps);
  if (outcome === 'not_found') return { ok: false, reason: 'not_found' };

  return {
    ok: true,
    entityType: target.entityType,
    entityId,
    level,
    changed: outcome === 'updated',
  };
}

/**
 * The exhaustive switch is the point — `never` on the default arm means a new
 * `UrgencyEntityType` is a compile error here, not a silent fallthrough that
 * returns success without writing anything.
 */
function writeFor(
  entityType: UrgencyEntityType,
  args: UrgencyWriteArgs,
  deps: UrgencyDeps,
): Promise<UrgencyWriteOutcome> {
  switch (entityType) {
    case 'order':
      return deps.setOrderUrgency(args);
    case 'receiving':
      return deps.setCartonUrgency(args);
    case 'support_ticket':
      return deps.setTicketUrgency(args);
    default: {
      const exhaustive: never = entityType;
      throw new Error(`Unhandled urgency entity type: ${String(exhaustive)}`);
    }
  }
}
