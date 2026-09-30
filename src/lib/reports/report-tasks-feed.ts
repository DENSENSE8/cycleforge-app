/** `GET /api/tasks` → {@link TaskDeskRow}[] — parsed ONCE at the `fetch` boundary, exactly as the other four report feeds are… */

import { z } from 'zod';
import {
  sortTaskDeskRows,
  taskDeskRowFromWire,
  type TaskDeskRow,
  type TaskDeskWireRow,
} from '@/lib/tasks/task-desk-row';
import { isTaskEntityType, type TaskEntityType } from '@/lib/tasks/task-vocabulary';
import { TASK_LINK_KINDS } from '@/lib/tasks/task-links-shared';

const personSchema = z.object({ id: z.number(), name: z.string() });

const ticketSchema = z.object({
  id: z.number(),
  provider: z.string(),
  subject: z.string().nullable(),
  status: z.string().nullable(),
  externalId: z.string().nullable(),
});

/**
 * The enum label is narrowed by the vocabulary's own predicate rather than by
 * a second literal union spelled here — a fourth entity type must widen ONE
 * list (`urgency-targets.ts`), not two.
 */
const entityTypeSchema = z.custom<TaskEntityType>((value) => isTaskEntityType(value), {
  message: 'not a task entity type',
});

const wireRowSchema: z.ZodType<TaskDeskWireRow> = z.object({
  id: z.number(),
  entityType: entityTypeSchema.nullable(),
  entityId: z.number().nullable(),
  note: z.string().nullable(),
  projectName: z.string().nullable(),
  status: z.string(),
  taskState: z.string().nullable(),
  priority: z.number().nullable(),
  assignee: personSchema.nullable(),
  assignees: z.array(personSchema),
  assignedBy: personSchema.nullable(),
  assignedAt: z.string(),
  startedAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  remindAt: z.string().nullable(),
  lastFollowUpAt: z.string().nullable(),
  nextFollowUpAt: z.string().nullable(),
  ticket: ticketSchema.nullable(),
  links: z.array(z.object({ kind: z.enum(TASK_LINK_KINDS), label: z.string() })),
  photoCount: z.number(),
  videoCount: z.number(),
  coverPhotoId: z.number().nullable(),
  docCount: z.number(),
});

const payloadSchema = z.object({
  ok: z.boolean().optional(),
  error: z.string().optional(),
  tasks: z.array(wireRowSchema).default([]),
});

/** Narrow one `/api/tasks` response into desk rows, in desk order. */
export function parseTaskDeskReportRows(payload: unknown): TaskDeskRow[] {
  const parsed = payloadSchema.parse(payload);
  if (parsed.ok === false) throw new Error(parsed.error || 'tasks report failed');
  return sortTaskDeskRows(parsed.tasks.map(taskDeskRowFromWire));
}
