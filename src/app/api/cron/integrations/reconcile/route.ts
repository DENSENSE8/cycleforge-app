/** GET /api/cron/integrations/reconcile — daily drift repair. */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { runReconcileAllOrgs } from '@/lib/integrations/connectors/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const hoursParam = Number(req.nextUrl.searchParams.get('hours'));
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : 25;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const locked = await withCronLock('integrations.reconcile', () =>
    withCronRun('integrations.reconcile', async () => {
      const results = await runReconcileAllOrgs({ since });
      const inboundFixed = results.reduce((s, r) => s + (r.outcome.inboundFixed ?? 0), 0);
      const outboundFixed = results.reduce((s, r) => s + (r.outcome.outboundFixed ?? 0), 0);
      const failures = results.filter((r) => !r.outcome.ok).length;
      return { ran: results.length, inboundFixed, outboundFixed, failures, results };
    }),
  );
  if (!locked.ran) {
    return NextResponse.json({ ok: true, skipped: 'locked' });
  }
  const summary = locked.result!;
  return NextResponse.json({ ok: true, summary });
}
