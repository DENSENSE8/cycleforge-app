/** Cron: reconcile every importing org's repairs against its Tasks board — the safety net behind the per-write hooks. */

import { NextResponse, type NextRequest } from 'next/server';

import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';
import { REPAIR_TASK_OWNER_IDS, type RepairTaskSyncSummary } from '@/lib/tasks/repair-tasks';
import { syncRepairTasks } from '@/lib/tasks/repair-tasks-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const JOB = 'tasks.repair_sync';

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();

  try {
    const locked = await withCronLock(JOB, () =>
      withCronRun(JOB, async () => {
        const orgIds = (await listSweepOrgIds()).filter((orgId) => REPAIR_TASK_OWNER_IDS[orgId]);
        const totals: RepairTaskSyncSummary = { repairs: 0, created: 0, closed: 0, reopened: 0, refreshed: 0, ticketLinked: 0, failed: 0 };
        let orgsFailed = 0;
        for (const orgId of orgIds) {
          try {
            const result = await syncRepairTasks(orgId);
            if (!result) continue;
            for (const key of Object.keys(totals) as Array<keyof RepairTaskSyncSummary>) totals[key] += result.summary[key];
          } catch (error) {
            orgsFailed += 1;
            console.error(`[cron/${JOB}] org ${orgId} failed:`, error);
          }
        }
        return { orgs: orgIds.length, orgsFailed, ...totals };
      }),
    );

    if (!locked.ran) return NextResponse.json({ success: true, skipped: 'locked' });
    return NextResponse.json({ success: true, ...locked.result! });
  } catch (error) {
    console.error(`[cron/${JOB}]`, error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
