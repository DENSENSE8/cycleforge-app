/** Source of truth for **cross-entity urgency** — the one place that answers "what does *urgent* mean for this kind of record, and where is… */

/** Record kinds that can carry urgency. */
export type UrgencyEntityType = 'order' | 'receiving' | 'support_ticket';

/** The shared rung. See the header for why this is binary and stays binary. */
export type UrgencyLevel = 'urgent' | 'normal';

interface UrgencyTarget {
  entityType: UrgencyEntityType;
  /** Operator-facing noun for the record, lowercase for mid-sentence use. */
  noun: string;
  /**
   * Where `urgent` actually lands. Free text for humans reading a diagnostic —
   * never parsed. The authoritative write is the matching `UrgencyDeps` method.
   */
  storage: string;
  /**
   * What the record's own richer scale is, when it has one. Callers that need
   * it go to the named module; this module never proxies it.
   */
  ownScale: string | null;
}

export const URGENCY_TARGETS: Readonly<Record<UrgencyEntityType, UrgencyTarget>> = {
  order: {
    entityType: 'order',
    noun: 'order',
    storage: 'orders.is_urgent',
    ownScale: null,
  },
  receiving: {
    entityType: 'receiving',
    noun: 'carton',
    // Two columns, one intent.
    storage: 'receiving_carton.priority_tier (0) + receiving_carton.is_priority',
    ownScale: 'src/lib/receiving/priority-override.ts — 4 manual tiers',
  },
  support_ticket: {
    entityType: 'support_ticket',
    noun: 'ticket',
    storage: 'helpdesk ticket priority',
    ownScale: 'helpdesk priority — low | normal | high | urgent',
  },
};

const ENTITY_TYPES = Object.keys(URGENCY_TARGETS) as UrgencyEntityType[];

/** Narrow an untrusted string (URL param, scan resolve, request body). */
export function isUrgencyEntityType(value: unknown): value is UrgencyEntityType {
  return typeof value === 'string' && (ENTITY_TYPES as string[]).includes(value);
}

/** Resolve a target descriptor. `null` for anything this module cannot carry. */
export function urgencyTarget(entityType: unknown): UrgencyTarget | null {
  return isUrgencyEntityType(entityType) ? URGENCY_TARGETS[entityType] : null;
}

/**
 * Every kind that can be promoted, in no meaningful order.
 *
 * Exposed so a picker renders from the registry instead of re-typing the union
 * — the drift that let four vocabularies exist in the first place.
 */
export function urgencyEntityTypes(): readonly UrgencyEntityType[] {
  return ENTITY_TYPES;
}
