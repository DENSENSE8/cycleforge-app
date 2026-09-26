/** Cron: turn `designated_<staff>` helpdesk tags into assigned tasks. */

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
