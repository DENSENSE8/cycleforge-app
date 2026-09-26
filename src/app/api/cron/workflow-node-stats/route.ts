import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { runWorkflowNodeStatsSnapshot } from '@/lib/workflow/node-stats';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/cron/workflow-node-stats (Vercel cron, daily 00:45) */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  try {
    const locked = await withCronLock('workflow.node_stats', () =>
      withCronRun('workflow.node_stats', () => runWorkflowNodeStatsSnapshot()),
    );
    if (!locked.ran) {
      return NextResponse.json({ success: true, skipped: 'locked' });
    }
    const result = locked.result!;
    logger.info(result, '[workflow-node-stats] Completed');
    return NextResponse.json(result);
  } catch (error) {
    console.error('[workflow-node-stats]', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
