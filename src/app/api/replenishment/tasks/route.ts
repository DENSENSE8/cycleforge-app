import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listOpenTasks } from '@/lib/replenishment/pick-face';

/**
 * GET /api/replenishment/tasks
 *
 * Returns open replenishment tasks (REQUESTED + IN_PROGRESS) ordered by
 * detected_at ascending so the oldest unfulfilled need is at the top.
 */
export const GET = withAuth(async (_req, ctx) => {
  const tasks = await listOpenTasks(ctx.organizationId);
  return NextResponse.json({ ok: true, tasks });
}, { permission: 'bin.adjust' });
