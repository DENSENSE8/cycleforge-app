/** `/api/tasks/[id]/follow-ups` — the chase log on a task (call / ticket / note; old email rows read only). */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { TaskFollowUpCreateSchema } from '@/lib/schemas/task-follow-ups';
import { listTaskFollowUps, logTaskFollowUp } from '@/lib/tasks/task-follow-ups-db';
import type {
  TaskFollowUpLogPayload,
  TaskFollowUpRefusal,
  TaskFollowUpsPayload,
} from '@/lib/tasks/task-follow-ups-shared';

export const dynamic = 'force-dynamic';

/** Domain refusal → HTTP. Each one is something the operator can act on. */
const REFUSAL_STATUS: Record<TaskFollowUpRefusal, number> = {
  task_not_found: 404,
  email_is_a_link: 400,
  occurred_in_future: 400,
  invalid_instant: 400,
};

/** `/api/tasks/:id/follow-ups` — withAuth does not forward route params. */
function taskIdFromPath(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('tasks');
  const n = Number(i >= 0 ? parts[i + 1] : undefined);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      }
      const followUps = await listTaskFollowUps(ctx.organizationId, taskId);
      if (!followUps) {
        return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
      }
      const payload: TaskFollowUpsPayload = { ok: true, followUps };
      return NextResponse.json(payload);
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks/[id]/follow-ups');
    }
  },
  { permission: 'work_orders.claim' },
);

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      }
      const parsed = TaskFollowUpCreateSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid body', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      // Tenant and actor from the auth context, never the body.
      const result = await logTaskFollowUp(ctx.organizationId, ctx.staffId, taskId, parsed.data);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: REFUSAL_STATUS[result.reason] });
      }

      const { followUp } = result;
      await recordAudit(pool, ctx, req, {
        source: 'api',
        action: AUDIT_ACTION.WORK_TASK_FOLLOW_UP_LOG,
        entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
        entityId: taskId,
        after: {
          followUpId: followUp.id,
          occurredAt: followUp.occurredAt,
          ...(result.nextFollowUpAt !== undefined ? { nextFollowUpAt: result.nextFollowUpAt } : {}),
        },
        // The words stay in the log row; the audit keeps who chased, how and when.
        extra: { channel: followUp.channel, direction: followUp.direction },
      });

      const payload: TaskFollowUpLogPayload = { ok: true, followUp };
      return NextResponse.json(payload, { status: 201 });
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks/[id]/follow-ups');
    }
  },
  { permission: 'work_orders.claim' },
);
