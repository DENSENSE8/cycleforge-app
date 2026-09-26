import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { refreshAllSuggestions } from '@/lib/neon/pairing-queries';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** GET /api/cron/sku-catalog/refresh-suggestions (Vercel cron, nightly) */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  try {
    const locked = await withCronLock('sku_catalog.refresh_suggestions', () =>
      withCronRun('sku_catalog.refresh_suggestions', async () => {
        const startedAt = Date.now();
        const orgIds = await listSweepOrgIds();
        let catalogsScanned = 0;
        let suggestionsWritten = 0;
        const perOrg: Array<{ orgId: string; ok: boolean; suggestionsWritten?: number; error?: string }> = [];
        for (const orgId of orgIds) {
          try {
            const r = await refreshAllSuggestions(orgId);
            catalogsScanned += r.catalogsScanned;
            suggestionsWritten += r.suggestionsWritten;
            perOrg.push({ orgId, ok: true, suggestionsWritten: r.suggestionsWritten });
          } catch (orgErr) {
            console.error(`[cron/refresh-suggestions] org ${orgId} failed:`, orgErr);
            perOrg.push({ orgId, ok: false, error: orgErr instanceof Error ? orgErr.message : 'failed' });
          }
        }
        return {
          orgsSwept: orgIds.length,
          catalogsScanned,
          suggestionsWritten,
          perOrg,
          durationMs: Date.now() - startedAt,
        };
      }),
    );
    if (!locked.ran) {
      return NextResponse.json({ success: true, skipped: 'locked' });
    }
    const result = locked.result!;
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'refresh-suggestions failed';
    console.error('[cron/refresh-suggestions] error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
