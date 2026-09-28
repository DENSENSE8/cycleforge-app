import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { sweepDeadSessions } from '@/lib/auth/session-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/cron/sessions-sweep (Vercel cron, daily) — delete dead staff sessions past retention. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  try {
    const locked = await withCronLock('auth_sessions_sweep', () =>
      withCronRun('auth.sessions_sweep', () => sweepDeadSessions()),
    );
    if (!locked.ran) return NextResponse.json({ success: true, skipped: 'locked' });
    return NextResponse.json({ success: true, ...locked.result! });
  } catch (err) {
    console.error('[cron/sessions-sweep]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'sweep failed' },
      { status: 500 },
    );
  }
}
