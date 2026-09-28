/**
 * GET  /api/sync/global            — the header Sync's jobs, each with its last run.
 * POST /api/sync/global?job=<id>   — run one job now (per-job permission).
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import type { PermissionString } from '@/lib/auth/permissions';
import { triggerCronPath } from '@/lib/cron/trigger';
import { withCronLock } from '@/lib/cron/lock';
import { latestCronRuns, withCronRun } from '@/lib/cron/run-log';
import { wouldExceedPlanCeiling } from '@/lib/billing/plan-ceilings';
import { loadOrdersBackfillPipeline } from '@/lib/sync/orders-backfill-pipeline-load';
import { listGlobalSyncJobs, ORDERS_PIPELINE_RUN_JOB, runGlobalSyncJob } from '@/lib/sync/global-sync';
import { pipelineFailure, type OrdersBackfillResult } from '@/lib/sync/orders-backfill-pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const GET = withAuth(async (_req, ctx) => {
  try {
    const jobs = await listGlobalSyncJobs((perm: PermissionString) => ctx.permissions.has(perm), latestCronRuns);
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    return errorResponse(err, 'GET /api/sync/global');
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const job = req.nextUrl.searchParams.get('job')?.trim() || '';
  const origin = new URL(req.url).origin;
  try {
    const result = await runGlobalSyncJob(ctx.organizationId, job, (perm: PermissionString) => ctx.permissions.has(perm), {
      runPipeline: async (orgId) => {
        // Same soft ceiling as `POST /api/integrations/[provider]/sync`.
        if (await wouldExceedPlanCeiling(orgId, 'maxMonthlyOrders')) {
          return { ok: false, steps: [{ step: 'plan', ok: false, error: 'PLAN_LIMIT' }], imported: 0, updated: 0 };
        }
        // The cron's lock + ledger: a manual run never overlaps a scheduled
        // one, and lands in the same record the header reads back — as
        // `failed` when any step failed, so the pill never shows a false green.
        let finished: OrdersBackfillResult | null = null;
        const locked = await withCronLock(ORDERS_PIPELINE_RUN_JOB, async () => {
          await withCronRun(
            ORDERS_PIPELINE_RUN_JOB,
            async (cronRunId) => {
              finished = await loadOrdersBackfillPipeline(orgId, { trigger: 'manual', staffId: ctx.staffId, cronRunId });
              if (!finished.ok) throw new Error(pipelineFailure(finished));
              return finished;
            },
            { trigger: 'manual' },
          ).catch((err) => {
            if (!finished) throw err;
          });
          return finished!;
        });
        return locked.ran ? locked.result! : 'locked';
      },
      triggerCron: (path) => triggerCronPath(origin, path),
    });
    return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: result.status });
  } catch (err) {
    return errorResponse(err, `POST /api/sync/global?job=${job}`);
  }
});
