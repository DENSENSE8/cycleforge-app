/** POST /api/receiving-lines/incoming/inventory-refresh */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { syncZohoPurchaseOrdersToReceiving } from '@/lib/zoho-receiving-sync';
import { syncZohoPoMirror } from '@/lib/zoho/po-mirror-sync';
import { getSyncCursor, updateSyncCursor } from '@/lib/sync-cursors';
import { formatApiOffsetTimestamp } from '@/utils/date';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MIRROR_CURSOR_KEY = 'zoho_po_mirror';

export const POST = withAuth(async (_req: NextRequest, ctx) => {
  const startedAt = Date.now();
  try {
    // ── 1. Issued POs → receiving_lines (same policy as the cron) ──────────
    const issued = await syncZohoPurchaseOrdersToReceiving(ctx.organizationId, {
      status: 'issued',
      days_back: 0,
      per_page: 200,
      max_pages: 25,
      max_items: 2000,
      po_date_floor: '2026-05-08',
    });

    // ── 2. Mirror status refresh (delta) — drives the received-clears ──────
    const mirrorCursor = await getSyncCursor(MIRROR_CURSOR_KEY, ctx.organizationId);
    const mirrorStart = mirrorCursor ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const mirror = await syncZohoPoMirror({
      mode: 'delta',
      lastModifiedTime: formatApiOffsetTimestamp(mirrorStart),
      maxPages: 200,
      maxItems: 20000,
    }, ctx.organizationId);
    if (mirror.errors.length === 0) {
      await updateSyncCursor(MIRROR_CURSOR_KEY, new Date(), ctx.organizationId);
    }

    // ── 3. Invalidate so the rail + tiles reflect the fresh state ──────────
    try {
      await invalidateReceivingViews(ctx.organizationId);
    } catch (err) {
      console.warn('incoming/inventory-refresh: cache invalidate failed (non-fatal)', err);
    }

    return NextResponse.json({
      ok: issued.failed === 0 && mirror.errors.length === 0,
      issued: {
        processed: issued.processed,
        created: issued.created,
        updated: issued.updated,
        linked: issued.linked,
        failed: issued.failed,
      },
      // `mirror_upserted` includes POs whose status changed to received/closed — those are the rows that clear from Incoming on the next read.
      mirror: {
        mode: mirror.mode,
        fetched: mirror.fetched,
        upserted: mirror.upserted,
        errors: mirror.errors.slice(0, 5),
      },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving-lines/incoming/inventory-refresh');
  }
}, { permission: 'receiving.view' });
