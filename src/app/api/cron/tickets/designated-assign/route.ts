/**
 * Cron: turn `designated_<staff>` helpdesk tags into assigned tasks.
 *
 * GET /api/cron/tickets/designated-assign?limit=100
 *
 * For each org with Zendesk connected, scans a page of that org's tickets
 * (ordered by `updated_at DESC`, so a freshly-tagged old ticket is in the very
 * next sweep), resolves each designation against the org's active roster, and
 * creates the `FOLLOW_UP` task through `createTask` — the same path
 * `POST /api/tasks` uses, so the assignee gets the identical inbox row and
 * audit trail. Idempotent: a ticket that already carries a non-CANCELED
 * FOLLOW_UP task is skipped, so re-running this costs nothing.
 *
 * House cron contract: isAuthorizedCronRequest → withCronLock → withCronRun;
 * registered in src/lib/cron/registry.ts + vercel.json (both SoTs).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { clampInt } from '@/lib/cron/params';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import { forEachOrgWithProvider } from '@/lib/cron/for-each-org';
import { runDesignatedAssign, type DesignatedAssignSummary } from '@/lib/tasks/designated-assign';
import { designatedAssignDeps } from '@/lib/tasks/designated-assign-deps';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const JOB = 'tickets.designated_assign';

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();

  const limit = clampInt(request.nextUrl.searchParams.get('limit'), 100, 1, 100);

  try {
    const locked = await withCronLock(JOB, () =>
      withCronRun(JOB, async () => {
        const perOrg = await forEachOrgWithProvider('zendesk', (orgId) =>
          runDesignatedAssign(orgId, designatedAssignDeps(orgId, { limit })),
        );

        const totals: DesignatedAssignSummary = {
          scanned: 0,
          assigned: 0,
          skipped: 0,
          ambiguous: 0,
        };
        let orgsFailed = 0;
        for (const org of perOrg) {
          if (!org.ok || !org.result) {
            orgsFailed += 1;
            continue;
          }
          totals.scanned += org.result.scanned;
          totals.assigned += org.result.assigned;
          totals.skipped += org.result.skipped;
          totals.ambiguous += org.result.ambiguous;
        }

        return { orgs: perOrg.length, orgsFailed, ...totals, limit };
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
