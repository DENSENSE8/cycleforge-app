import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { isOpsTvBoard } from '@/lib/feature-flags';
import { listPlans, listTasksForInbox } from '@/lib/ops-plans/queries';
import { buildTvBoard } from '@/lib/ops-plans/tv-board';
import { getCurrentPSTDateKey, warehouseDayUtcBounds } from '@/utils/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/operations/tv-board — the unattended Operations wall board (HOME-OPS
 * Phase C, plan §7 / §27). Read-only aggregation over the org's open plan tasks
 * + active plans into four lanes: Due today · Overdue · By station · Plan
 * progress. Consumed by the `?tv=1` kiosk surface (OperationsTvBoard).
 *
 * House read-route shape (mirrors ops-plans/inbox/route.ts): withAuth + a
 * read-only permission, no body, no audit, no side-effects. Gated by
 * `operations.tv.view` (least-privilege — a kiosk token never reaches an edit
 * surface) AND the per-org `isOpsTvBoard` flag (dogfood-first; 404 when off, so
 * the surface is never exposed before rollout). Tenant scope comes from the
 * org-scoped domain queries (`tenantQuery` GUC per read); "today" is a warehouse
 * civil-day window (PST) via `warehouseDayUtcBounds` — never host-local time.
 * Live refresh is client-side over `ops_plan.updated`, so this is not polled.
 */
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
