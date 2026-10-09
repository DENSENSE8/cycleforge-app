/**
 * POST /api/returns/backfill — walk the caller's eBay / Amazon return history
 * into the inbound import (`runReturnsBackfillPipeline`), newest first, in
 * provider-sized windows. Bounded per call; the next call resumes from the
 * org's frontier. `dryRun` previews every chunk and writes nothing (no
 * orders, no frontier). Shares the returns cron's lock and run ledger, so a
 * manual walk never overlaps a scheduled one.
 *
 * Body `{ providers?: ('ebay' | 'amazon')[], since?: ISO, until?: ISO, dryRun?: boolean }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { ReturnsBackfillBody } from '@/lib/schemas/returns-backfill';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import { RETURNS_PROVIDERS, returnsBackfillFailure } from '@/lib/sync/returns-backfill-pipeline';
import { loadReturnsBackfillPipeline } from '@/lib/sync/returns-backfill-pipeline-load';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** The returns cron's job key — one lock, one ledger. */
const RETURNS_JOB = 'returns.sync';
/** No chunk starts after this much of the call — a report can take minutes. */
const CALL_BUDGET_MS = 200_000;
/** Chunks per provider per call; the budget usually stops it first. */
const MAX_CHUNKS_PER_CALL = 12;

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseBody(ReturnsBackfillBody, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;

  const providers = parsed.providers ?? RETURNS_PROVIDERS;
  const staffId = typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  const deadline = new Date(Date.now() + CALL_BUDGET_MS);
  const locked = await withCronLock(RETURNS_JOB, () =>
    withCronRun(
      RETURNS_JOB,
      (cronRunId) =>
        loadReturnsBackfillPipeline(ctx.organizationId, {
          providers,
          since: parsed.since,
          until: parsed.until,
          dryRun: parsed.dryRun,
          trigger: 'manual',
          staffId,
          cronRunId,
          maxChunks: MAX_CHUNKS_PER_CALL,
          deadline,
        }),
      { trigger: 'manual', failureOf: (result) => (result.ok ? null : returnsBackfillFailure(result)) },
    ),
  );
  if (!locked.ran) {
    return NextResponse.json({ success: false, error: 'A returns sync is already running — try again shortly.' }, { status: 409 });
  }
  const result = locked.result!;

  if (!result.dryRun) {
    await recordAudit(pool, ctx, req, {
      source: 'returns-backfill-api',
      action: AUDIT_ACTION.RECEIVING_RETURNS_BACKFILL,
      entityType: AUDIT_ENTITY.INTEGRATION,
      entityId: providers.join(','),
      after: {
        since: result.since,
        until: result.until,
        providers: result.providers.map((p) => ({
          provider: p.provider,
          status: p.status,
          chunks: p.chunks.length,
          landed: p.chunks.reduce((n, c) => n + c.files.reduce((m, f) => m + f.summary.landed, 0), 0),
          frontier: p.frontier,
          remainingChunks: p.remainingChunks,
          error: p.error ?? null,
        })),
      },
    });
  }

  return NextResponse.json({ success: result.ok, ...result });
}, { permission: 'orders.import' });
