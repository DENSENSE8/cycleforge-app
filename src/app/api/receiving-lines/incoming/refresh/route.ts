/** POST /api/receiving-lines/incoming/refresh */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { syncShipmentsByIds } from '@/lib/shipping/scheduler';
import { selectIncomingShipmentIds } from '@/lib/receiving/incoming-shipments';
import { getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { isIncomingUniversal } from '@/lib/feature-flags';
import { syncEbayPurchasesToReceiving } from '@/lib/inbound/sync-ebay-purchases';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BATCH_CAP = 250;        // hard ceiling on shipments polled per refresh
const COOLDOWN_SECONDS = 25;  // collapse rapid re-clicks across operators

interface RefreshSummary {
  ok: true;
  scanned: number;   // shipments re-polled
  delivered: number; // newly terminal (delivered/returned) this pass
  updated: number;   // non-terminal status refreshed
  errors: number;
  capped: boolean;   // true when more incoming shipments exist than BATCH_CAP
  throttled?: boolean;
  // Universal Incoming (plan §9.4): eBay buyer-purchase pull, when the flag is on.
  ebay_ingested?: number;
  ebay_created?: number;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'incoming-tracking-refresh',
    limit: 6,
    windowMs: 60_000,
    organizationId: ctx.organizationId,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined },
    );
  }

  // Cross-operator cooldown: if someone just refreshed, return that result.
  // Per-org cooldown key so one tenant's refresh summary can't be served to —
  // or suppress the cooldown of — another tenant.
  const cooldownKey = `last:${ctx.organizationId}`;
  const cached = await getCachedJson<RefreshSummary>('incoming-refresh', cooldownKey);
  if (cached) {
    return NextResponse.json({ ...cached, throttled: true });
  }

  // Scope to EXACTLY the shipments backing the Incoming table — the tracking#s an operator actually sees in the list — not every active…
  const rows = await selectIncomingShipmentIds(BATCH_CAP, ctx.organizationId);

  const capped = rows.length > BATCH_CAP;
  const batch = rows.slice(0, BATCH_CAP);
  const result = await syncShipmentsByIds(batch, { concurrency: 5 });

  // Universal Incoming (plan §9.4):
  let ebayIngested = 0;
  let ebayCreated = 0;
  try {
    if (await isIncomingUniversal(ctx.organizationId)) {
      const ebay = await syncEbayPurchasesToReceiving(ctx.organizationId);
      ebayIngested = ebay.ingested;
      ebayCreated = ebay.created;
    }
  } catch (e) {
    console.warn('[incoming/refresh] eBay purchase sync failed (non-fatal)', e);
  }

  // Carrier statuses changed or new eBay lines landed → drop the row/summary
  // caches so the next refetch reflects freshly-delivered/imported purchases.
  if (result.terminal > 0 || result.synced > 0 || ebayCreated > 0) {
    try {
      await invalidateReceivingViews(ctx.organizationId);
    } catch { /* non-fatal */ }
  }

  const summary: RefreshSummary = {
    ok: true,
    scanned: batch.length,
    delivered: result.terminal,
    updated: result.synced,
    errors: result.errors,
    capped,
    ebay_ingested: ebayIngested,
    ebay_created: ebayCreated,
  };

  await setCachedJson('incoming-refresh', cooldownKey, summary, COOLDOWN_SECONDS);
  return NextResponse.json(summary);
}, { permission: 'receiving.view' });
