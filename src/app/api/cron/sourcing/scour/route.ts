import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { logger } from '@/lib/observability/logger';
import { forEachOrgWithProvider } from '@/lib/cron/for-each-org';
import { runScourWatch } from '@/lib/jobs/scour-watch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/sourcing/scour  (Vercel cron, daily)
 *
 * Runs runScourWatch — re-runs every due standing (saved) sourcing search across
 * the enabled channels and saves the hits to the watchlist. Cadence windows in
 * getDueSourcingSearches keep each search to roughly its daily/weekly rate.
 *
 * Tenancy (Phase D — DONE): fans out per eBay-connected org via
 * forEachOrgWithProvider('ebay', …). Each org runs runScourWatch(orgId), which
 * reads only THAT org's due searches (GUC-scoped getDueSourcingSearches), scours
 * with THAT org's eBay credentials (the eBay SourceAdapter resolves
 * getIntegrationCredentials(orgId,'ebay')), and marks the run under its own org.
 * Orgs without eBay connected are never iterated (nothing to scour with), so the
 * old cross-tenant risk — a non-USAV org scouring on USAV's creds — is gone.
 * Every active eBay account is now vault-backed, so the provider query is the
 * complete sweep. Per-org failures are isolated by forEachOrgWithProvider.
 */
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
