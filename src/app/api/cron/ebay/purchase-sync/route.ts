import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { forEachOrgWithProvider } from '@/lib/cron/for-each-org';
import { syncEbayPurchasesToReceiving } from '@/lib/inbound/sync-ebay-purchases';
import { isIncomingUniversal } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/ebay/purchase-sync (Vercel cron, every 30 min) — Universal
 * Incoming Track A. Each run re-reads an overlapping modified-time window (see
 * `syncEbayPurchasesToReceiving`), so missed runs and late tracking are
 * recovered; the cron_runs summary records landed / updated / unchanged / failed.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  try {
    const locked = await withCronLock('ebay.purchase_sync', () =>
      withCronRun('ebay.purchase_sync', async () => {
        const results = await forEachOrgWithProvider('ebay', async (orgId) => {
          if (!(await isIncomingUniversal(orgId))) return { skipped: 'flag_off' as const };
          return syncEbayPurchasesToReceiving(orgId);
        });
        const totals = { orgs: results.length, orgsRun: 0, ordersFetched: 0, landed: 0, updated: 0, unchanged: 0, failed: 0 };
        const errors: string[] = [];
        for (const r of results) {
          if (!r.ok) { errors.push(`${r.orgId}: ${r.error instanceof Error ? r.error.message : String(r.error)}`); continue; }
          if (r.result && 'landed' in r.result) {
            totals.orgsRun += 1;
            totals.ordersFetched += r.result.ordersFetched;
            totals.landed += r.result.landed;
            totals.updated += r.result.updated;
            totals.unchanged += r.result.unchanged;
            totals.failed += r.result.failed;
            if (r.result.errors.length) errors.push(...r.result.errors.map((e) => `${r.orgId}: ${e}`));
          }
        }
        return { ...totals, errors };
      }),
    );
    if (!locked.ran) {
      return NextResponse.json({ success: true, skipped: 'locked' });
    }
    return NextResponse.json({ success: true, ...locked.result });
  } catch (error: unknown) {
    console.error('[ebay/purchase-sync]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
