/** `POST /api/tasks/[id]/alerts` — alert staff (default: the task's owners) to follow up on a task. */

import { randomUUID } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { logger } from '@/lib/observability/logger';
import { TaskAlertCreateSchema } from '@/lib/schemas/task-alerts';
import { sendTaskAlert, type TaskAlertRefusal } from '@/lib/tasks/task-alerts';
import { publishTaskAlerts, taskAlertDeps } from '@/lib/tasks/task-alerts-db';

export const dynamic = 'force-dynamic';

/** Domain refusal → HTTP. Each one is something the operator can act on. */
const REFUSAL_STATUS: Record<TaskAlertRefusal, number> = {
  task_not_found: 404,
  no_recipients: 400,
  cannot_alert_self: 400,
  invalid_staff: 400,
  invalid_due: 400,
};

/** `/api/tasks/:id/alerts` — withAuth does not forward route params. */
function taskIdFromPath(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('tasks');
  const n = Number(i >= 0 ? parts[i + 1] : undefined);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      }
      const parsed = TaskAlertCreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid body', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      // Tenant and actor from the auth context, never the body. Recipients are
      // checked against THIS org inside `sendTaskAlert`.
      const result = await sendTaskAlert(
        {
          taskId,
          actorStaffId: ctx.staffId,
          alertKey: parsed.data.clientEventId ?? randomUUID(),
          body: parsed.data,
        },
        taskAlertDeps(ctx.organizationId),
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      }

      const { staffIds, note, dueAt, deliveries } = result;
      // A replayed alert key inserts nothing: no second audit row, no second push.
      if (deliveries.length === 0) {
        return NextResponse.json({ ok: true, idempotent: true, staffIds, itemIds: [] });
      }

      await recordAudit(pool, ctx, req, {
        source: 'api',
        action: AUDIT_ACTION.TASK_FOLLOW_UP_ALERT,
        entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
        entityId: taskId,
        after: { staffIds, note, dueAt },
      });

      after(() =>
        publishTaskAlerts(ctx.organizationId, { taskId, actorStaffId: ctx.staffId, note, deliveries }).catch(
          (error: unknown) => logger.warn({ taskId, error: String(error) }, 'task alert push failed'),
        ),
      );

      return NextResponse.json(
        { ok: true, staffIds, itemIds: deliveries.map((d) => d.itemId) },
        { status: 201 },
      );
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks/[id]/alerts');
    }
  },
  { permission: 'work_orders.claim' },
);
