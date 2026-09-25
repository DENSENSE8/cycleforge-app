import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import { createTask } from '@/lib/tasks/create-task';
import { TASK_ASSIGNEES_MAX, TASK_NOTE_MAX, TASK_PROJECT_NAME_MAX, TASK_STAFF_ID_MAX } from '@/lib/tasks/create-task-core';
import { listTaskDeskRows } from '@/lib/tasks/list-tasks';
import { taskDeskDbDeps } from '@/lib/tasks/list-tasks-db';
import { parseTaskDeskLane, type TaskDeskListPayload } from '@/lib/tasks/task-desk-row';
import { urgencyEntityTypes } from '@/lib/urgency/urgency-targets';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks — throw a task at a colleague.
 *
 * Creates a `FOLLOW_UP` work_assignment pointing at a record, and (when marked
 * urgent) promotes that record through the cross-entity urgency SoT so it also
 * surfaces in the Urgent lanes everyone already watches.
 *
 * WHY NOT `POST /api/assignments`
 *   That route does find-active-and-update, because a bench runs one entity at
 *   a time. A thrown task is exempt from `ux_work_assignments_active_entity`
 *   (2026-08-08b) precisely so two people can be handed the same record for
 *   different reasons — routing through the upsert would silently hijack an
 *   existing task instead of creating a second. Same table, genuinely different
 * job: a sibling, not a fork.
 *
 * PERMISSION — `work_orders.claim`, the same gate `POST /api/assignments`
 *   already uses, and one every floor role holds (scripts/seed-roles.mjs).
 *   Throwing a task is an everyday floor action; gating it harder would send
 *   operators back to paper, which is the problem this replaces.
 */

const BodySchema = z.object({
  entityType: z.enum(urgencyEntityTypes() as unknown as [string, ...string[]]),
  entityId: z.number().int().positive(),
  assigneeStaffId: z.number().int().positive().max(TASK_STAFF_ID_MAX).optional(),
  assigneeStaffIds: z.array(z.number().int().positive().max(TASK_STAFF_ID_MAX)).min(1).max(TASK_ASSIGNEES_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate assignee').optional(),
  projectName: z.string().trim().max(TASK_PROJECT_NAME_MAX).optional(),
  note: z.string().max(TASK_NOTE_MAX).optional(),
  urgency: z.enum(['urgent', 'normal']).optional(),
  /**
   * Optional promised day. Present so the desk composer captures assignee ·
   * priority · deadline in ONE audited create instead of POST-then-PATCH.
   */
  deadlineAt: z.string().datetime().nullish(),
  /** Optional reminder instant (`remind_at`), read by `GET /api/v1/reminders`. */
  remindAt: z.string().datetime({ offset: true }).nullish(),
  /** Accepted in-body as well as via the Idempotency-Key header. */
  idempotencyKey: z.string().min(1).max(255).optional(),
}).refine((body) => body.assigneeStaffIds !== undefined || body.assigneeStaffId !== undefined, {
  message: 'At least one assignee is required',
}).refine((body) => body.assigneeStaffIds === undefined || body.assigneeStaffId === undefined ||
  body.assigneeStaffIds[0] === body.assigneeStaffId, {
  message: 'Primary assignee must be first member',
});

/** Domain refusal → HTTP. Each one is something the operator can act on. */
const REFUSAL_STATUS: Record<string, number> = {
  unsupported_entity: 400,
  invalid_entity_id: 400,
  invalid_assignee: 400,
  note_too_long: 400,
  project_name_too_long: 400,
  invalid_project_name: 400,
  self_throw: 409,
  invalid_deadline: 400,
  invalid_reminder: 400,
};

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const json = await req.json().catch(() => null);
      const parsed = BodySchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid body', details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const body = parsed.data;

      // A wedge double-fire and a flaky-network retry must both be no-ops. The
      // key may ride the header or the body; the station bar mints one per throw.
      const idempotencyKey = readIdempotencyKey(req, body.idempotencyKey ?? null);

      // Explicit body type: `produce` returns either a refusal or a created
      // task, and the claim helper is generic over ONE body shape.
      const out = await withIdempotencyClaim<Record<string, unknown>>(
        pool,
        {
          orgId: ctx.organizationId,
          idempotencyKey,
          route: 'tasks.post',
          staffId: ctx.staffId ?? null,
        },
        async () => {
          const result = await createTask(ctx.organizationId, {
            entityType: body.entityType,
            entityId: body.entityId,
            assigneeStaffId: body.assigneeStaffId,
            assigneeStaffIds: body.assigneeStaffIds,
            projectName: body.projectName,
            note: body.note,
            urgency: body.urgency,
            deadlineAt: body.deadlineAt ?? null,
            remindAt: body.remindAt ?? null,
            actorStaffId: ctx.staffId,
          });

          if (!result.ok) {
            return {
              status: REFUSAL_STATUS[result.reason] ?? 400,
              body: { error: result.reason },
            };
          }

          await recordAudit(pool, ctx, req, {
            source: 'api',
            action: AUDIT_ACTION.WORK_TASK_THROW,
            entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
            entityId: result.task.id,
            extra: {
              targetEntityType: result.task.entityType,
              targetEntityId: result.task.entityId,
              assigneeStaffId: result.task.assigneeStaffId,
              assigneeStaffIds: result.task.assigneeStaffIds,
              projectName: result.task.projectName,
              // What happened to the RECORD, not the task row — 'failed' here
              // means the throw landed but the promotion did not.
              urgency: result.urgency,
              // Whether the recipient was actually told. Audited because
              // "thrown but nobody notified" is the failure an operator would
              // otherwise only discover by asking.
              notified: result.notified,
              notifications: result.notifications,
            },
          });

          return {
            status: 201,
            body: {
              success: true,
              task: result.task,
              urgency: result.urgency,
              notified: result.notified,
              notifications: result.notifications,
            },
          };
        },
      );

      return NextResponse.json(out.body, { status: out.status });
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks');
    }
  },
  { permission: 'work_orders.claim' },
);

/**
 * GET /api/tasks — the task desk's read.
 *
 * Defaults are the working list: `lane=open`, `assignee=me`. `assignee=all`
 * is the explicit team read (the reports tab's done-lane roll-up) — it is
 * opt-in rather than the default because the desk an operator opens is THEIR
 * desk, and a screen that opens on everyone's work is a screen nobody acts on.
 *
 * `?q=` is the find text of whichever surface is reading (the completed-tasks
 * report today). It is answered in SQL by `listTaskDeskRows` rather than in the
 * browser, because the page the client holds is a WINDOW: a substring pass over
 * it can only ever find tasks that already arrived, and it re-narrows the
 * answer to the facts the mounted columns happen to paint.
 *
 * `?assignedBy=me` narrows to tasks the caller THREW (`assigned_by_staff_id`);
 * combined with `assignee=all` it is "what I handed off". Only `me` is
 * accepted — the thrower filter reads the caller's own ledger, not a colleague's.
 *
 * No `recordAudit`: reads are covered by the route-level access log, and an
 * audit row per desk refresh would bury the writes it exists to surface.
 */
const QuerySchema = z.object({
  lane: z.enum(['open', 'done', 'all']).optional(),
  assignee: z.union([z.literal('me'), z.literal('all'), z.string().regex(/^\d+$/)]).optional(),
  assignedBy: z.literal('me').optional(),
  priority: z.enum(['urgent', 'normal']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  q: z.string().max(200).optional(),
});

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid query', details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const query = parsed.data;

      // The tenant and the staffer both come from the auth context. A caller
      // cannot read another org's desk, and `me` cannot be spoofed.
      const assignee = query.assignee ?? 'me';
      const assigneeStaffId =
        assignee === 'all' ? null : assignee === 'me' ? ctx.staffId : Number(assignee);

      const tasks = await listTaskDeskRows(
        ctx.organizationId,
        {
          lane: parseTaskDeskLane(query.lane),
          assigneeStaffId,
          assignedByStaffId: query.assignedBy === 'me' ? ctx.staffId : null,
          urgency: query.priority ?? null,
          limit: query.limit ? Number(query.limit) : undefined,
          q: query.q ?? null,
        },
        taskDeskDbDeps,
      );

      const payload: TaskDeskListPayload = { ok: true, count: tasks.length, tasks };
      return NextResponse.json(payload);
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks');
    }
  },
  { permission: 'work_orders.claim' },
);
