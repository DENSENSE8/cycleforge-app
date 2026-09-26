/** POST /api/receiving-lines/incoming/marketplace-refresh */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { isIncomingUniversal } from '@/lib/feature-flags';
import { syncEbayPurchasesToReceiving } from '@/lib/inbound/sync-ebay-purchases';
import {
  resolveInboundSettings,
  isInboundSourceEnabled,
  ensureEbayInboundSourceEnabled,
} from '@/lib/inbound/org-settings';
import { hasConnectedEbayBuyerAccount } from '@/lib/ebay/credentials';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = withAuth(async (_req: NextRequest, ctx) => {
  const startedAt = Date.now();
  try {
    if (!(await isIncomingUniversal(ctx.organizationId))) {
      return NextResponse.json({
        ok: false,
        error: 'Universal Incoming is not enabled for this organization.',
      }, { status: 400 });
    }

    let settings = await resolveInboundSettings(ctx.organizationId);
    let ebayEnabled = isInboundSourceEnabled(settings, 'ebay');

    // Self-heal: buyer connected but stale enabledSources omitted ebay.
    if (!ebayEnabled && (await hasConnectedEbayBuyerAccount(ctx.organizationId))) {
      try {
        await ensureEbayInboundSourceEnabled(ctx.organizationId);
        settings = await resolveInboundSettings(ctx.organizationId);
        ebayEnabled = isInboundSourceEnabled(settings, 'ebay');
      } catch (err) {
        console.warn('incoming/marketplace-refresh: ensure ebay source failed (non-fatal)', err);
      }
    }

    const amazonEnabled = isInboundSourceEnabled(settings, 'amazon');

    let ebay = { accounts: 0, linesFetched: 0, ingested: 0, created: 0, errors: [] as string[] };
    if (ebayEnabled) {
      const r = await syncEbayPurchasesToReceiving(ctx.organizationId);
      ebay = {
        accounts: r.accounts,
        linesFetched: r.linesFetched,
        ingested: r.ingested,
        created: r.created,
        errors: r.errors,
      };
    }

    const notes: string[] = [];
    if (!ebayEnabled) {
      notes.push(
        'eBay inbound source is disabled for this org. Connect a purchasing account in Settings → Integrations.',
      );
    }
    if (amazonEnabled) notes.push('Amazon inbound sync is not available yet.');
    if (ebayEnabled && ebay.linesFetched === 0 && ebay.ingested === 0 && ebay.errors.length === 0) {
      notes.push('No new eBay purchases found for connected buyer accounts.');
    }

    if (ebay.created > 0 || ebay.ingested > 0) {
      try {
        await invalidateReceivingViews(ctx.organizationId);
      } catch (err) {
        console.warn('incoming/marketplace-refresh: cache invalidate failed (non-fatal)', err);
      }
    }

    return NextResponse.json({
      ok: ebay.errors.length === 0,
      ebay,
      notes,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving-lines/incoming/marketplace-refresh');
  }
}, { permission: 'receiving.view' });
