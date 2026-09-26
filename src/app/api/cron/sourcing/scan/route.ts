import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { logger } from '@/lib/observability/logger';
import { runSourcingScanJob } from '@/lib/jobs/sourcing-scan';
import {
  runSourcingDemandCollectorsJob,
  DEMAND_CAP_PER_ORG,
} from '@/lib/jobs/sourcing-demand-collectors';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** GET /api/cron/sourcing/scan (Vercel cron, daily) */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  try {
    const locked = await withCronLock('sourcing.scan', () =>
      withCronRun('sourcing.scan', async () => {
        const scan = await runSourcingScanJob();
        const demand = await runSourcingDemandCollectorsJob({ capPerOrg: DEMAND_CAP_PER_ORG });
        return { ...scan, demand };
      }),
    );
    if (!locked.ran) {
      return NextResponse.json({ success: true, skipped: 'locked' });
    }
    const result = locked.result!;
    logger.info(result, '[cron.sourcing.scan]');
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sourcing scan failed';
    console.error('[cron.sourcing.scan] error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
