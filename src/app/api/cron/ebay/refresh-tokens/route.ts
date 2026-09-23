import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { runEbayRefreshTokensJob } from '@/lib/jobs/ebay-refresh-tokens';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/cron/ebay/refresh-tokens  (Vercel cron, hourly) */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  try {
    const locked = await withCronLock('ebay.refresh_tokens', () =>
      withCronRun('ebay.refresh_tokens', runEbayRefreshTokensJob),
    );
    if (!locked.ran) {
      return NextResponse.json({ success: true, skipped: 'locked' });
    }
    const result = locked.result!;
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[ebay/refresh-tokens]', error);
    return NextResponse.json({ success: false, error: error?.message || 'Internal error' }, { status: 500 });
  }
}
