import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { projectReceivingTriageMemberships } from '@/lib/receiving/feed-membership-projection';
import { projectOrdersUnshippedMemberships } from '@/lib/orders/feed-membership-projection';
import { refreshAllOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { forEachActiveOrg } from '@/lib/cron/for-each-org';
import { deriveSkuPickOwners } from '@/lib/picking/sku-pick-owners';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB = 'feed_memberships.projection';

/** GET /api/cron/feed-membership-projection (Vercel cron, every 10 min) */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  const windowParam = Number(request.nextUrl.searchParams.get('windowDays'));
  const windowDays = Number.isFinite(windowParam) && windowParam > 0 ? windowParam : 90;

  try {
    const locked = await withCronLock(JOB, () =>
      withCronRun(JOB, async () => {
        // Stage facts first: the orders projection reads their pick / pack flags.
        // The sweep catches writers that move a fact indirectly (label → shipment,
        // allocation changes, automation-written assignments).
        const facts = await forEachActiveOrg((orgId, client) => refreshAllOrderStageFacts(orgId, client));
        const orderStageFacts = {
          changed: facts.reduce((n, r) => n + (r.result ?? 0), 0),
          failedOrgs: facts.filter((r) => !r.ok).map((r) => r.orgId),
        };
        // New pick patterns become item owners (next picker default). Existing
        // owners — operator overrides included — are never replaced.
        const owners = await forEachActiveOrg((orgId, client) => deriveSkuPickOwners(orgId, { dryRun: false, client }));
        const skuPickOwners = {
          inserted: owners.reduce((n, r) => n + (r.result?.inserted ?? 0), 0),
          failedOrgs: owners.filter((r) => !r.ok).map((r) => r.orgId),
        };
        const receiving = await projectReceivingTriageMemberships(windowDays);
        const orders = await projectOrdersUnshippedMemberships(windowDays);
        return { orderStageFacts, skuPickOwners, receiving, orders };
      }),
    );
    if (!locked.ran) return NextResponse.json({ success: true, skipped: 'locked' });
    return NextResponse.json(locked.result!);
  } catch (error) {
    console.error('[feed-membership-projection]', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
