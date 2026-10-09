/**
 * GET /api/cron/returns/sync — platform returns for every org with an eBay or
 * Amazon connection: the incremental sync per provider (`runReturnsSync`,
 * from each org's `returns:<provider>` cursor), then — while time is left —
 * one chunk of the default 18-month history backfill per provider
 * (`runReturnsBackfillPipeline`, a no-op once the frontier passes the range).
 * Every return lands through the uploaded-report import, so each order
 * record shows its return reason.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { forEachOrgWithProvider } from '@/lib/cron/for-each-org';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ReturnsProvider } from '@/lib/returns/return-files';
import type { ReturnsSyncResult } from '@/lib/returns/returns-sync';
import { loadReturnsSync } from '@/lib/returns/returns-sync-load';
import { RETURNS_PROVIDERS, returnsBackfillFailure, type ReturnsBackfillResult } from '@/lib/sync/returns-backfill-pipeline';
import { loadReturnsBackfillPipeline } from '@/lib/sync/returns-backfill-pipeline-load';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const JOB = 'returns.sync';
/** No backfill chunk starts after this much of the run — a report can take minutes. */
const BACKFILL_BUDGET_MS = 150_000;

interface IncrementalRun {
  orgId: OrgId;
  provider: ReturnsProvider;
  result?: ReturnsSyncResult;
  error?: string;
}

interface ReturnsCronSummary {
  synced: number;
  landed: number;
  failures: string[];
  incremental: IncrementalRun[];
  backfill: Array<{ orgId: OrgId; result?: ReturnsBackfillResult; error?: string }>;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const deadline = new Date(Date.now() + BACKFILL_BUDGET_MS);
  const locked = await withCronLock(JOB, () =>
    withCronRun(
      JOB,
      async (cronRunId): Promise<ReturnsCronSummary> => {
        const incremental: IncrementalRun[] = [];
        for (const provider of RETURNS_PROVIDERS) {
          const runs = await forEachOrgWithProvider(provider, (orgId) =>
            loadReturnsSync(orgId, { provider, dryRun: false, trigger: 'cron', cronRunId }),
          );
          for (const run of runs) {
            incremental.push(
              run.ok
                ? { orgId: run.orgId, provider, result: run.result }
                : { orgId: run.orgId, provider, error: run.error instanceof Error ? run.error.message : String(run.error) },
            );
          }
        }

        // History, a chunk per provider per org per run, only where the incremental reached the platform.
        const backfillProviders = new Map<OrgId, ReturnsProvider[]>();
        for (const run of incremental) {
          if (run.result?.status !== 'synced') continue;
          backfillProviders.set(run.orgId, [...(backfillProviders.get(run.orgId) ?? []), run.provider]);
        }
        const backfill: ReturnsCronSummary['backfill'] = [];
        for (const [orgId, providers] of backfillProviders) {
          if (Date.now() >= deadline.getTime()) break;
          try {
            const result = await loadReturnsBackfillPipeline(orgId, { providers, maxChunks: 1, trigger: 'cron', cronRunId, deadline });
            if (result.providers.some((p) => p.chunks.length > 0 || !p.ok)) backfill.push({ orgId, result });
          } catch (error) {
            backfill.push({ orgId, error: error instanceof Error ? error.message : String(error) });
          }
        }

        const failures = [
          ...incremental
            .filter((r) => r.error || !r.result?.ok)
            .map((r) => `org ${r.orgId} ${r.provider}: ${r.error ?? r.result?.error ?? 'failed'}`),
          ...backfill
            .filter((r) => r.error || !r.result?.ok)
            .map((r) => `org ${r.orgId} backfill: ${r.error ?? returnsBackfillFailure(r.result!)}`),
        ];
        const files = [
          ...incremental.flatMap((r) => r.result?.files ?? []),
          ...backfill.flatMap((r) => r.result?.providers.flatMap((p) => p.chunks.flatMap((c) => c.files)) ?? []),
        ];
        return {
          synced: incremental.filter((r) => r.result?.status === 'synced').length,
          landed: files.reduce((n, f) => n + f.summary.landed, 0),
          failures,
          incremental,
          backfill,
        };
      },
      { failureOf: (summary) => (summary.failures.length > 0 ? summary.failures.join(' | ') : null) },
    ),
  );
  if (!locked.ran) return NextResponse.json({ ok: true, skipped: 'locked' });
  const summary = locked.result!;
  return NextResponse.json({ ok: summary.failures.length === 0, summary });
}
