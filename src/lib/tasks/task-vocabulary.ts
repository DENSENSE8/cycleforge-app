/** Source of truth for the **throwable task** vocabulary. */

import { isUrgencyEntityType, type UrgencyEntityType } from '@/lib/urgency/urgency-targets';

/** The `work_type_enum` label for an ad-hoc thrown task (migration 2026-08-08a). */
export const TASK_WORK_TYPE = 'FOLLOW_UP' as const;

/** `work_assignments.status` a freshly thrown task starts in. */
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

/** Read a stored priority back as an urgency level. */
export function taskUrgencyFromPriority(priority: number | null | undefined): TaskUrgency {
  return typeof priority === 'number' && priority <= TASK_PRIORITY.urgent ? 'urgent' : 'normal';
}

/** Record kinds a task can be thrown about. */
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

/** Kinds the inbox ledger can currently anchor. */
const TASK_ENTITY_TYPES_INBOX_READY: readonly TaskEntityType[] = [
  'order',
  'receiving',
  'support_ticket',
];

export function isInboxAnchorable(entityType: TaskEntityType): boolean {
  return TASK_ENTITY_TYPES_INBOX_READY.includes(entityType);
}
