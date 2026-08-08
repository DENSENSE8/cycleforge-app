/**
 * Source of truth for the **throwable task** vocabulary.
 *
 * A thrown task is a `work_assignments` row with `work_type = 'FOLLOW_UP'` —
 * the thing an operator hands a colleague instead of writing a tracking number
 * on paper and texting it.
 *
 * This module holds the three mappings that would otherwise be re-derived at
 * every call site, and it is pure + dependency-free so a client picker can
 * import it without dragging a write path into the browser bundle.
 *
 * ## 1. Why FOLLOW_UP is not a station type
 *
 * The six existing `work_type_enum` values (TEST, PACK, REPAIR, QA, RECEIVE,
 * STOCK_REPLENISH) all name a **bench** an entity is run through. A thrown task
 * is not a bench; it is "please look at this". Reusing a station type would put
 * ad-hoc work into the queue metrics for a bench nobody ran it through, and it
 * would inherit that bench's one-active-row uniqueness — see below.
 *
 * ## 2. Urgency is the EXISTING priority int, not a new column
 *
 * `work_assignments.priority` already exists (int, default 100) and the read
 * index sorts it ASCENDING, so a lower number surfaces first. Adding an
 * `is_urgent` boolean beside it would be a second answer to one question — the
 * exact fork the cross-entity urgency SoT exists to prevent. Urgent is simply a
 * lower number, named here so no call site invents its own.
 *
 * The gap between 10 and 100 is deliberate headroom: an intermediate tier can
 * land between them later without renumbering existing rows.
 *
 * ## 3. Two case conventions, and neither is wrong
 *
 * The same record is named three times across this feature:
 *
 *   | Layer                  | Vocabulary                        | Case      |
 *   |------------------------|-----------------------------------|-----------|
 *   | `work_assignments`     | `work_entity_type_enum`           | SCREAMING |
 *   | `staff_inbox_items`    | `entity_type` CHECK               | lowercase |
 *   | `src/lib/urgency/`     | `UrgencyEntityType`               | lowercase |
 *
 * The SCREAMING case is the enum's own long-standing convention (ORDER,
 * RECEIVING, …) and predates everything here; the lowercase is the inbox
 * CHECK's. Changing either is a migration on a live column for a cosmetic win,
 * so instead the translation lives HERE, once, and every layer keeps its own
 * spelling. A call site that hand-uppercases a type string is the drift this
 * mapping exists to absorb.
 */

import { isUrgencyEntityType, type UrgencyEntityType } from '@/lib/urgency/urgency-targets';

/** The `work_type_enum` label for an ad-hoc thrown task (migration 2026-08-08a). */
export const TASK_WORK_TYPE = 'FOLLOW_UP' as const;

/**
 * `work_assignments.status` a freshly thrown task starts in.
 *
 * OPEN, not ASSIGNED: the row is created already pointing at someone, but the
 * recipient has not acknowledged it. ASSIGNED would claim an acceptance that
 * has not happened, and the whole point of throwing a task is that the thrower
 * finds out whether it was picked up.
 */
export const TASK_INITIAL_STATUS = 'OPEN' as const;

/**
 * Urgent vs normal, expressed in the column that already exists.
 * LOWER SORTS FIRST — `idx_work_assignments_assignee` orders priority ASC.
 */
export const TASK_PRIORITY = {
  urgent: 10,
  normal: 100,
} as const;

export type TaskUrgency = keyof typeof TASK_PRIORITY;

/** The stored `priority` int for an urgency level. */
export function taskPriorityFor(urgency: TaskUrgency): number {
  return TASK_PRIORITY[urgency];
}

/**
 * Read a stored priority back as an urgency level.
 *
 * Threshold, not equality: rows written before this vocabulary existed (and any
 * a future tier introduces) carry arbitrary ints, and an `=== 10` test would
 * report every one of them as normal.
 */
export function taskUrgencyFromPriority(priority: number | null | undefined): TaskUrgency {
  return typeof priority === 'number' && priority <= TASK_PRIORITY.urgent ? 'urgent' : 'normal';
}

/**
 * Record kinds a task can be thrown about.
 *
 * Intentionally the SAME set as `UrgencyEntityType`, and derived from it rather
 * than re-declared: a task's whole value is that it points at a record you can
 * open and can mark urgent, so a kind that cannot carry urgency has nothing to
 * offer here. If the two sets ever genuinely diverge, split them then — not
 * pre-emptively, because two hand-maintained copies of one list is how the four
 * urgency vocabularies happened.
 */
export type TaskEntityType = UrgencyEntityType;

/** Narrow an untrusted string (request body, resolved scan). */
export const isTaskEntityType = isUrgencyEntityType;

const TASK_ENTITY_ENUM = {
  order: 'ORDER',
  receiving: 'RECEIVING',
  support_ticket: 'SUPPORT_TICKET',
} as const satisfies Record<TaskEntityType, string>;

/** Shared lowercase type → the `work_entity_type_enum` label stored on the row. */
export function taskEntityEnum(entityType: TaskEntityType): (typeof TASK_ENTITY_ENUM)[TaskEntityType] {
  return TASK_ENTITY_ENUM[entityType];
}

const TASK_ENTITY_SHARED = Object.fromEntries(
  Object.entries(TASK_ENTITY_ENUM).map(([shared, enumLabel]) => [enumLabel, shared]),
) as Record<string, TaskEntityType>;

/** `work_entity_type_enum` label → the shared lowercase type. `null` if unknown. */
export function taskEntityFromEnum(enumLabel: unknown): TaskEntityType | null {
  return typeof enumLabel === 'string' ? TASK_ENTITY_SHARED[enumLabel] ?? null : null;
}

/**
 * Kinds the inbox ledger can currently anchor.
 *
 * `staff_inbox_items.entity_type` CHECK allows receiving · receiving_line ·
 * serial_unit · order · fba_shipment · repair · warranty_claim — it does **not**
 * include `support_ticket`. So a ticket task is representable as a
 * work_assignment today but NOT yet as an inbox row; widening that CHECK (with
 * its delete trigger, per polymorphic-tables.md) is phase 3's job.
 *
 * The predicate is the API so the fan-out can refuse honestly instead of
 * throwing a constraint violation at an operator who threw a perfectly legal
 * ticket task. The list itself stays private — phase 3 can export it if it
 * turns out to need one, rather than shipping a second name for the same fact
 * ahead of any consumer.
 */
const TASK_ENTITY_TYPES_INBOX_READY: readonly TaskEntityType[] = ['order', 'receiving'];

export function isInboxAnchorable(entityType: TaskEntityType): boolean {
  return TASK_ENTITY_TYPES_INBOX_READY.includes(entityType);
}
