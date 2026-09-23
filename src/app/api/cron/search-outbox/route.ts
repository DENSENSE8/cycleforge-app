/**
 * Cron: drain the entity_search_outbox into entity_search_docs.
 *
 * GET /api/cron/search-outbox?batch=50&maxBatches=10
 *
 * The async half of the AI-search freshness pipeline (trigger → outbox →
 * worker, docs/ai-search-modernization-plan.md locked decision 5). Loops
 * bounded drain batches until the queue is empty or maxBatches is hit, so a
 * burst of writes can't run the function past its duration budget. Embedding
 * is best-effort inside the worker — a down provider still upserts keyword-
 * searchable docs.
 *
 * Auth: CRON_SECRET bearer (same gate as the other
 * /api/cron routes). Cron routes are session-less by design — no staff
 * session wrapper (see docs/security/route-permissions.json exemption
 * pattern for /api/cron/*).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { clampInt } from '@/lib/cron/params';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import {
  drainSearchOutbox,
  sweepEmbeddingRetries,
  type DrainResult,
} from '@/lib/search/search-outbox-worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  const batchSize = clampInt(req.nextUrl.searchParams.get('batch'), 50, 1, 200);
  const maxBatches = clampInt(req.nextUrl.searchParams.get('maxBatches'), 10, 1, 50);

  const totals: DrainResult = { claimed: 0, upserted: 0, embedded: 0, deleted: 0, failed: 0 };
  let batches = 0;
  let retryEnqueued = 0;

  try {
    // Overlap guard (house pattern): maxDuration equals the cron cadence, so
    // a budget-length run would otherwise overlap the next invocation.
    const locked = await withCronLock('search-outbox', () =>
      withCronRun('search-outbox', async () => {
        for (let i = 0; i < maxBatches; i++) {
          const r = await drainSearchOutbox({ batchSize });
          batches += 1;
          totals.claimed += r.claimed;
          totals.upserted += r.upserted;
          totals.embedded += r.embedded;
          totals.deleted += r.deleted;
          totals.failed += r.failed;
          if (r.claimed < batchSize) break; // queue drained
        }
        // Heal stale NULL-embedding docs (failed embeds / pre-env backfill) —
        // bounded, deduped on the pending unique, drained by the next run.
        // No-op while the embed provider is unconfigured.
        retryEnqueued = await sweepEmbeddingRetries({ limit: batchSize * 2 });
        return { batches, retryEnqueued, ...totals };
      }),
    );
    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'drain failed',
        batches,
        ...totals,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, batches, retryEnqueued, ...totals });
}
