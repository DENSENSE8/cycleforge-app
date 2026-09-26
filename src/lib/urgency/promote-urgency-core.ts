/** Cross-entity urgency — the pure orchestration half. */

import {
  urgencyTarget,
  type UrgencyEntityType,
  type UrgencyLevel,
} from './urgency-targets';

/** What a storage write reports back. */
export type UrgencyWriteOutcome = 'updated' | 'unchanged' | 'not_found';

export interface UrgencyWriteArgs {
  entityId: number;
  level: UrgencyLevel;
}

/** One method per storage. */
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

/** Every `ok: false` reason below is reachable — there is deliberately no placeholder state. */
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

/** Promote (or clear) urgency on one record. */
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
