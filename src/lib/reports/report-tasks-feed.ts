/**
 * `GET /api/tasks` → {@link TaskDeskRow}[] — parsed ONCE at the `fetch`
 * boundary, exactly as the other four report feeds are
 * (`report-rows.ts`, `staff-day-rows.ts`).
 *
 * The wire shape is NOT re-declared here: {@link TaskDeskWireRow} is the
 * contract the route publishes and `taskDeskRowFromWire` is the one place
 * ISO strings become epoch ms and a stored `priority` int becomes an urgency.
 * This module only proves that what arrived matches that contract before the
 * resolvers are promised real fields — a report that silently drops rows is a
 * report with a wrong count.
 *
 * Parsing THROWS rather than skipping a bad row: `/reports` already paints an
 * error face for a failed load, which is the honest answer when the tasks
 * route changes shape under the tab.
 */

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
  entityType: entityTypeSchema,
  entityId: z.number(),
  note: z.string().nullable(),
  projectName: z.string().nullable(),
  status: z.string(),
  priority: z.number().nullable(),
  assignee: personSchema.nullable(),
  assignees: z.array(personSchema),
  assignedBy: personSchema.nullable(),
  assignedAt: z.string(),
  startedAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  remindAt: z.string().nullable(),
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

/**
 * Narrow one `/api/tasks` response into desk rows, in desk order.
 *
 * The order is {@link sortTaskDeskRows} — the SAME comparator the desk and the
 * phone use — so a header click on the report re-orders a page that arrived
 * looking like every other tasks surface, rather than in whatever order the
 * route happened to emit.
 */
export function parseTaskDeskReportRows(payload: unknown): TaskDeskRow[] {
  const parsed = payloadSchema.parse(payload);
  if (parsed.ok === false) throw new Error(parsed.error || 'tasks report failed');
  return sortTaskDeskRows(parsed.tasks.map(taskDeskRowFromWire));
}
