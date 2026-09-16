/**
 * GET /api/cron/integrations/refresh — proactive token refresh + self-heal.
 *
 * Two passes, hourly:
 *   1. Rotate OAuth tokens for every active vault connection whose expires_at
 *      falls within the look-ahead window (default 60 min; override with
 *      ?thresholdMinutes=N) by calling the connector's refresh().
 *   2. Revalidate every connection latched to `status='error'` and lift the
 *      latch when the stored credential proves alive. This is the backstop for
 *      the 2026-09-14 Zoho blackout: a transient provider throttle must never
 *      require a human to re-run OAuth.
 *
 * Auth via Bearer CRON_SECRET, mirroring the sibling integrations crons.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { runTokenRefreshSweep } from '@/lib/integrations/connectors/refresh-sweep';
import { runConnectionSelfHeal } from '@/lib/integrations/connectors/self-heal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const thresholdParam = Number(req.nextUrl.searchParams.get('thresholdMinutes'));
  const thresholdMinutes =
    Number.isFinite(thresholdParam) && thresholdParam > 0 ? thresholdParam : undefined;

  const locked = await withCronLock('integrations.token_refresh', () =>
    withCronRun('integrations.token_refresh', async () => {
      const { scanned, refreshed, skipped, failures, attempts } = await runTokenRefreshSweep({
        thresholdMinutes,
      });
      const selfHeal = await runConnectionSelfHeal();
      return { scanned, refreshed, skipped, failures, attempts, selfHeal };
    }),
  );
  if (!locked.ran) {
    return NextResponse.json({ ok: true, skipped: 'locked' });
  }
  const summary = locked.result!;
  return NextResponse.json({ ok: true, summary });
}
