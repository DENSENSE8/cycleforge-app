/**
 * Source of truth for **cross-entity urgency** — the one place that answers
 * "what does *urgent* mean for this kind of record, and where is it stored?"
 *
 * Before this module there were four unrelated mechanisms wearing one word:
 *
 *   | Record        | Column                                  | Vocabulary            |
 *   |---------------|-----------------------------------------|-----------------------|
 *   | order         | `orders.is_urgent`                      | boolean               |
 *   | carton        | `receiving.priority_tier` + `is_priority` | 4 manual tiers + bool |
 *   | support ticket| helpdesk `priority`                     | low/normal/high/urgent|
 *   | order (again) | `order_flags.flag = 'priority'`         | 5 row-tint tags       |
 *
 * …with four write paths, four read paths, and nothing reconciling them. An
 * operator who says "make this urgent" about a pasted identifier does not know
 * or care which of the four they have, so *something* has to hold the mapping.
 * That something is this file.
 *
 * ## The vocabulary is deliberately BINARY, and that is the whole design
 *
 * `urgent | normal` is the only rung all three storages genuinely share. The
 * richer per-record scales are NOT absorbed here — `priority-override.ts` still
 * owns the four manual carton tiers and their tones, and the helpdesk still
 * owns its own four levels. This module maps the shared rung onto each storage
 * and stops.
 *
 * Widening it to a 4-level union is the obvious next idea and it is the wrong
 * one: `orders.is_urgent` has exactly two states, so three of the four values
 * would be a lie on every order, and a cross-entity caller would have to know
 * which entity types can honour which level — which is precisely the knowledge
 * this module exists to hold on their behalf. A record that needs its full
 * scale reaches for its own module.
 *
 * ## `order_flags.flag = 'priority'` is NOT urgency and is deliberately absent
 *
 * It is a shared row TINT an operator applies to a queue for triage
 * ("pull this one forward"), disjoint from `is_urgent` by construction —
 * nothing syncs them and an order may legitimately carry either, both, or
 * neither. Folding it in would make "make this urgent" write two columns with
 * different meanings and different audiences. Vocabulary + write side stay in
 * `orders/order-row-flags.ts` / `orders/order-flags.ts`.
 *
 * Pure and dependency-free so a client surface can import the vocabulary
 * without dragging the server write path into its bundle
 * (bundle altitude). The write half lives in
 * `promote-urgency-core.ts` (pure orchestration) + `promote-urgency.ts`
 * (server binding).
 */

/**
 * Record kinds that can carry urgency.
 *
 * Names match the `staff_inbox_items.entity_type` CHECK vocabulary on purpose,
 * so a thrown task, its inbox row, and its urgency all name the same record
 * with the same string rather than three near-synonyms that need a translation
 * table between them.
 */
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
    // Two columns, one intent. `priority_tier` is the manual override and
    // `is_priority` is the older boolean that several queues still read on its
    // own, so they move together or a promoted carton is invisible to half the
    // surfaces that should show it. Lockstep rule mirrors the one already
    // enforced in `PATCH /api/receiving-logs`: is_priority ⇔ (tier === 0).
    // Type string is `receiving` (matching the staff_inbox_items entity
    // vocabulary); the TABLE is `receiving_carton`. They differ on purpose —
    // the bare `receiving` compat view was dropped.
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
