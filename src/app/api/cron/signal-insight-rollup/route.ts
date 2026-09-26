import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { runSignalInsightRollup } from '@/lib/operations/signal-rollup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB = 'insights.signal_rollup';

/** GET /api/cron/signal-insight-rollup (Vercel cron, nightly) */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  const windowParam = Number(request.nextUrl.searchParams.get('windowDays'));
  const windowDays = Number.isFinite(windowParam) && windowParam > 0 ? windowParam : 30;

  try {
    const locked = await withCronLock(JOB, () =>
      withCronRun(JOB, () => runSignalInsightRollup(windowDays)),
    );
    if (!locked.ran) {
      return NextResponse.json({ success: true, skipped: 'locked' });
    }
    return NextResponse.json(locked.result!); // already { success: true, rowsWritten, windowDays }
  } catch (error) {
    console.error('[signal-insight-rollup]', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
