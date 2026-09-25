/**
 * PATCH /api/tasks/[id] — edit one thrown task from the desk.
 *
 * The desk's verbs (mark done, re-prioritise, move the deadline, hand it to
 * someone else, rewrite the description, set a reminder) are ONE route because
 * they are one row and one audit story: every successful call writes a
 * `work_task.update` row naming exactly which fields moved, so "who moved this
 * deadline" stays answerable.
 *
 * ## The body is a strict allowlist, and an unknown key is a REFUSAL
 * `work_assignments` carries station columns (`assigned_tech_id`,
 * `completed_by_packer_id`, `out_of_stock`, …) that no desk edit may reach.
 * Silently ignoring an unrecognised key would let a caller believe it landed;
 * 403 naming the key says which door is shut. That is why the schema is
 * `z.strictObject` and the unrecognised-keys issue is handled explicitly
 * rather than flattened into the generic 400.
 *
 * PERMISSION — `work_orders.claim`, the same gate POST /api/tasks uses.
 * Driving a task you were handed is the same everyday floor act as throwing
 * one; a harder gate here would send operators back to paper.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { type TaskDeskPatch } from '@/lib/tasks/list-tasks';
import { TASK_ASSIGNEES_MAX, TASK_NOTE_MAX, TASK_PROJECT_NAME_MAX, TASK_STAFF_ID_MAX } from '@/lib/tasks/create-task-core';
import { createTaskDeps } from '@/lib/tasks/create-task-deps';
import { patchTaskDeskRow } from '@/lib/tasks/list-tasks-db';
import { isInboxAnchorable, TASK_PRIORITY } from '@/lib/tasks/task-vocabulary';
import { isTaskDeskStatus } from '@/lib/tasks/task-desk-row';

export const dynamic = 'force-dynamic';

/** `priority` is an int column; 10 (urgent) and 100 (normal) are the SoT rungs. */
const PRIORITY_MAX = 1000;

const isoish = z.string().refine((raw) => Number.isFinite(Date.parse(raw)), {
  message: 'not a parseable timestamp',
});

const PatchSchema = z.strictObject({
  status: z.string().refine(isTaskDeskStatus, { message: 'not an assignment status' }).optional(),
  priority: z.number().int().min(0).max(PRIORITY_MAX).optional(),
  deadlineAt: isoish.nullable().optional(),
  startedAt: isoish.nullable().optional(),
  assigneeStaffId: z.number().int().positive().max(TASK_STAFF_ID_MAX).optional(),
  assigneeStaffIds: z.array(z.number().int().positive().max(TASK_STAFF_ID_MAX)).min(1).max(TASK_ASSIGNEES_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate assignee').optional(),
  projectName: z.string().trim().max(TASK_PROJECT_NAME_MAX).nullable().optional(),
  /** The task description (`notes`). Trimmed by the store; blank clears it. */
  note: z.string().max(TASK_NOTE_MAX).nullable().optional(),
  /** "Remind me" instant; null clears it. */
  remindAt: isoish.nullable().optional(),
}).refine((body) => body.assigneeStaffId === undefined || body.assigneeStaffIds === undefined ||
  body.assigneeStaffId === body.assigneeStaffIds[0], {
  message: 'Primary assignee must be first member',
});

/** Domain refusal → HTTP. Each one is something the operator can act on. */
const REFUSAL_STATUS: Record<string, number> = {
  not_found: 404,
  illegal_transition: 409,
  invalid_assignee: 400,
};

function taskIdFromUrl(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const n = Number(parts[parts.length - 1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const PATCH = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromUrl(req);
      if (taskId === null) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      }

      const json = await req.json().catch(() => null);
      const parsed = PatchSchema.safeParse(json);
      if (!parsed.success) {
        const unknownKeys = parsed.error.issues
          .filter((issue) => issue.code === 'unrecognized_keys')
          .flatMap((issue) => (issue as { keys?: string[] }).keys ?? []);
        if (unknownKeys.length > 0) {
          return NextResponse.json(
            {
              error: `Field not editable from the task desk: ${unknownKeys.join(', ')}`,
              fields: unknownKeys,
            },
            { status: 403 },
          );
        }
        return NextResponse.json(
          { error: 'Invalid body', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const patch: TaskDeskPatch = parsed.data;
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
      }

      // Tenant from the auth context, never the body.
      const result = await patchTaskDeskRow(ctx.organizationId, taskId, patch, ctx.staffId);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.reason, detail: result.detail ?? null },
          { status: REFUSAL_STATUS[result.reason] ?? 400 },
        );
      }

      // The diff is the point of the row: a bare "updated" makes "who moved
      // this deadline" unanswerable, the same lossiness assigned_by_staff_id
      // exists to fix.
      await recordAudit(pool, ctx, req, {
        source: 'api',
        action: AUDIT_ACTION.WORK_TASK_UPDATE,
        entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
        entityId: result.task.id,
        before: {
          status: result.before.status,
          assigneeStaffId: result.before.assigneeStaffId,
          assigneeStaffIds: result.before.assigneeStaffIds,
          projectName: result.before.projectName,
        },
        after: {
          status: result.task.status,
          assigneeStaffId: result.task.assignee?.id ?? null,
          assigneeStaffIds: result.task.assignees.map(({ id }) => id),
          projectName: result.task.projectName,
          priority: result.task.priority,
          deadlineAt: result.task.deadlineAt,
          startedAt: result.task.startedAt,
          completedAt: result.task.completedAt,
          remindAt: result.task.remindAt,
          // The text itself is not copied into the audit trail; that the
          // description moved (and who moved it) is the fact worth keeping.
          noteChanged: patch.note !== undefined,
        },
        extra: {
          // Which fields this call actually carried — distinguishes "moved the
          // deadline" from "marked done", which the after-snapshot alone cannot.
          changed: result.changed,
          targetEntityType: result.task.entityType,
          targetEntityId: result.task.entityId,
        },
      });

      // Handing the task to someone new must reach them the way a fresh throw
      // does. Best-effort per member: the edit already landed.
      const before = new Set(result.before.assigneeStaffIds);
      const added = result.task.assignees
        .map(({ id }) => id)
        .filter((id) => !before.has(id) && id !== ctx.staffId);
      if (added.length > 0 && isInboxAnchorable(result.task.entityType)) {
        const deps = createTaskDeps(ctx.organizationId);
        const ids = result.task.assignees.map(({ id }) => id);
        const task = {
          id: result.task.id,
          entityType: result.task.entityType,
          entityId: result.task.entityId,
          assigneeStaffId: ids[0],
          assigneeStaffIds: ids,
          projectName: result.task.projectName,
          priority: result.task.priority ?? TASK_PRIORITY.normal,
          note: result.task.note,
        };
        const urgent = task.priority <= TASK_PRIORITY.urgent;
        await Promise.allSettled(
          added.map((recipientStaffId) =>
            deps.notifyAssignee({ task, recipientStaffId, actorStaffId: ctx.staffId, urgent }),
          ),
        );
      }

      return NextResponse.json({ ok: true, task: result.task });
    } catch (error) {
      return errorResponse(error, 'PATCH /api/tasks/[id]');
    }
  },
  { permission: 'work_orders.claim' },
);
