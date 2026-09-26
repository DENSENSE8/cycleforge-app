import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { logger } from '@/lib/observability/logger';
import { forEachOrgWithProvider } from '@/lib/cron/for-each-org';
import { runScourWatch } from '@/lib/jobs/scour-watch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** GET /api/cron/sourcing/scour (Vercel cron, daily) */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  try {
    const locked = await withCronLock('sourcing.scour', () =>
      withCronRun('sourcing.scour', async () => {
        const perOrg = await forEachOrgWithProvider(
          'ebay',
          (orgId) => runScourWatch(orgId),
        );

        const totals = { checked: 0, withHits: 0, candidatesSaved: 0 };
        const errors: string[] = [];
        for (const r of perOrg) {
          if (r.ok && r.result) {
            totals.checked += r.result.checked;
            totals.withHits += r.result.withHits;
            totals.candidatesSaved += r.result.candidatesSaved;
          } else if (!r.ok && errors.length < 25) {
            errors.push(`org ${r.orgId}: ${r.error instanceof Error ? r.error.message : String(r.error)}`);
          }
        }

        return {
          ...totals,
          orgs_swept: perOrg.length,
          orgs_failed: perOrg.filter((r) => !r.ok).length,
          errors,
        };
      }),
    );
    if (!locked.ran) {
      return NextResponse.json({ success: true, skipped: 'locked' });
    }
    const result = locked.result!;
    logger.info(result, '[cron.sourcing.scour]');
    return NextResponse.json({ success: result.orgs_failed === 0, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scour watch failed';
    console.error('[cron.sourcing.scour] error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
