/**
 * GET /api/cron/shipstation/orders-sync — the scheduled ShipStation order pull.
 * ShipStation is the sole outbound-order importer (owner 2026-09-24). It runs
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { runOrdersSyncAllOrgs } from '@/lib/integrations/connectors/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const locked = await withCronLock('shipstation.orders_sync', () =>
    withCronRun('shipstation.orders_sync', async () => {
      const results = await runOrdersSyncAllOrgs(['shipstation']);
      const imported = results.reduce((s, r) => s + (r.outcome.imported ?? 0), 0);
      const updated = results.reduce((s, r) => s + (r.outcome.updated ?? 0), 0);
      const failures = results.filter((r) => !r.outcome.ok).length;
      return { ran: results.length, imported, updated, failures, results };
    }),
  );
  if (!locked.ran) {
    return NextResponse.json({ ok: true, skipped: 'locked' });
  }
  return NextResponse.json({ ok: true, summary: locked.result! });
}
