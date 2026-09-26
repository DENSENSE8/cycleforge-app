import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { isOpsTvBoard } from '@/lib/feature-flags';
import { listPlans, listTasksForInbox } from '@/lib/ops-plans/queries';
import { buildTvBoard } from '@/lib/ops-plans/tv-board';
import { getCurrentPSTDateKey, warehouseDayUtcBounds } from '@/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/operations/tv-board — the unattended Operations wall board (HOME-OPS Phase C, plan §7 / §27). */
export const GET = withAuth(
  async (_req, ctx) => {
    const orgId = ctx.organizationId;

    if (!(await isOpsTvBoard(orgId))) {
      return NextResponse.json({ error: 'NOT_ENABLED' }, { status: 404 });
    }

    const dateKey = getCurrentPSTDateKey();
    const bounds = warehouseDayUtcBounds(dateKey);
    if (!bounds) {
      return NextResponse.json({ error: 'BAD_DATE' }, { status: 500 });
    }

    const [tasks, plansResult] = await Promise.all([
      listTasksForInbox(orgId), // open + in_progress across all plans, due-first
      // Progress lane: most-recently-touched active plans only. `limit` bounds
      // the per-plan ops_plan_progress() fan-out to what the wall renders.
      listPlans(orgId, { status: 'active', limit: 12 }),
    ]);

    const board = buildTvBoard({
      tasks,
      plans: plansResult.plans,
      dayStartMs: Date.parse(bounds.startIso),
      dayEndMs: Date.parse(bounds.endIso),
      dateKey,
      generatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ enabled: true, board });
  },
  { permission: 'operations.tv.view' },
);
