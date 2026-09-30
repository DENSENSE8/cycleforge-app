/** `GET /api/tasks/[id]/timeline` — the task's audit half of its Timeline (created, owners, status, due, alerts sent). */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { readTaskTimelineAudit } from '@/lib/tasks/task-timeline-db';
import type { TaskTimelinePayload } from '@/lib/tasks/task-timeline';

export const dynamic = 'force-dynamic';

/** `/api/tasks/:id/timeline` — withAuth does not forward route params. */
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
      // Tenant from the auth context, never the request.
      const history = await readTaskTimelineAudit(ctx.organizationId, taskId);
      if (!history) {
        return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
      }
      const payload: TaskTimelinePayload = { ok: true, ...history };
      return NextResponse.json(payload);
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks/[id]/timeline');
    }
  },
  { permission: 'work_orders.claim' },
);
