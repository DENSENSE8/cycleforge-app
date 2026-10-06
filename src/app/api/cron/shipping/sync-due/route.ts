/** GET /api/cron/shipping/sync-due */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { logger } from '@/lib/observability/logger';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import {
  runShippingSyncDueJob,
  normalizeShippingSyncDuePayload,
  type ShippingSyncDuePayload,
} from '@/lib/jobs/shipping-sync-due';

export const dynamic = 'force-dynamic';
// Cap at 300s — matches Vercel's default function ceiling. The scheduler
// processes shipments in `concurrency`-sized chunks so a 200-row sweep with
// concurrency=8 finishes well inside the budget.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  const sp = req.nextUrl.searchParams;
  const carriersParam = sp.getAll('carriers');
  const payload: ShippingSyncDuePayload = {
    limit: sp.get('limit') ?? undefined,
    concurrency: sp.get('concurrency') ?? undefined,
    carriers:
      carriersParam.length > 0
        ? carriersParam.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
        : undefined,
  };
  const params = normalizeShippingSyncDuePayload(payload);

  const startedAt = Date.now();
  try {
    const locked = await withCronLock('shipping.sync_due', () =>
      withCronRun('shipping.sync_due', () => runShippingSyncDueJob(payload), {
        failureOf: (run) =>
          run.configFaults.length > 0
            ? `carrier credentials missing: ${run.configFaults.map((f) => `${f.carrier} (${f.missing.join(', ')})`).join('; ')}`
            : null,
      }),
    );
    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
    const result = locked.result!;

    // One structured log line — Vercel/Datadog scrapers key off the prefix
    // to plot run cadence + failure rate. Keep field names stable.
    logger.info({
      ok: result.ok,
      limit: params.limit,
      concurrency: params.concurrency,
      carriers: params.carriers ?? 'all',
      synced: result.synced,
      terminal: result.terminal,
      errors: result.errors,
      overdueCandidates: result.overdueCandidates,
      alertSubscriptionsAdded: result.alertSubscriptionsAdded,
      configFaults: result.configFaults,
      durationMs: result.durationMs,
    }, '[cron.shipping.sync-due]');

    // A carrier without credentials polls nothing: fail the run (503) so the
    // cron dashboard and cron_runs show it, instead of `ok` over a stale board.
    if (!result.ok) {
      logger.error({ configFaults: result.configFaults }, '[alert.shipping.carrier-config]');
      return NextResponse.json(result, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'shipping sync threw';
    console.error('[cron.shipping.sync-due] fatal', { message, elapsedMs: Date.now() - startedAt });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
