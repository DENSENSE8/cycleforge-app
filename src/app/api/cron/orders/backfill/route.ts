/**
 * GET /api/cron/orders/backfill — the orders backfill pipeline for every org:
 * ShipStation → Google Sheets backup → other linked channels → exceptions, one
 * step after the other (`runOrdersBackfillPipeline`). Replaces the separate
 * ShipStation cron (owner 2026-09-28). `?sheetsFull=1` reads every sheet tab
 * once (the history backfill); scheduled runs read the rolling 7 days.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';
import { loadOrdersBackfillPipeline } from '@/lib/sync/orders-backfill-pipeline-load';
import { pipelineFailure, type OrdersBackfillResult } from '@/lib/sync/orders-backfill-pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const sheetsFull = req.nextUrl.searchParams.get('sheetsFull') === '1';
  // Built inside the ledgered body, kept outside it: a failed step marks the
  // run `failed` (the header pill reads that) without losing the summary.
  let summary: { orgs: number; imported: number; updated: number; failures: number; perOrg: unknown[] } | null = null;
  const locked = await withCronLock('orders.backfill_pipeline', () =>
    withCronRun('orders.backfill_pipeline', async () => {
      const perOrg: Array<{ orgId: string; result?: OrdersBackfillResult; error?: string }> = [];
      for (const orgId of await listSweepOrgIds()) {
        try {
          const result = await loadOrdersBackfillPipeline(orgId, { sheetsFull });
          if (result.steps.length > 0) perOrg.push({ orgId, result });
        } catch (error) {
          perOrg.push({ orgId, error: error instanceof Error ? error.message : String(error) });
        }
      }
      const failed = perOrg.filter((r) => r.error || !r.result?.ok);
      summary = {
        orgs: perOrg.length,
        imported: perOrg.reduce((n, r) => n + (r.result?.imported ?? 0), 0),
        updated: perOrg.reduce((n, r) => n + (r.result?.updated ?? 0), 0),
        failures: failed.length,
        perOrg,
      };
      if (failed.length > 0) {
        throw new Error(failed.map((r) => `org ${r.orgId}: ${r.error ?? pipelineFailure(r.result!)}`).join(' | '));
      }
      return summary;
    }).catch((err) => {
      if (!summary) throw err;
      return summary;
    }),
  );
  if (!locked.ran) return NextResponse.json({ ok: true, skipped: 'locked' });
  return NextResponse.json({ ok: summary!.failures === 0, summary });
}
