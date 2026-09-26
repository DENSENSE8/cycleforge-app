/** GET /api/receiving-lines/incoming/delivered-not-unboxed */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  listDeliveredNotUnboxed,
  DELIVERED_NOT_UNBOXED_WINDOW_DAYS,
} from '@/lib/receiving/delivered-not-unboxed';
import { getOrSet } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    // 60s-polled Incoming lane. Cached org-scoped; every receiving write busts
    // receiving-lines (org-scoped), so the lane refreshes on any dock activity.
    const items = await getOrSet(
      CACHE_NS.receivingIncomingLanes,
      ctx.organizationId,
      'delivered-not-unboxed',
      CACHE_TTL.rollup,
      [CACHE_TAGS.receivingLines],
      () => listDeliveredNotUnboxed(ctx.organizationId),
    );
    return NextResponse.json({
      success: true,
      count: items.length,
      window_days: DELIVERED_NOT_UNBOXED_WINDOW_DAYS,
      items,
    });
  } catch (err) {
    console.error('[incoming/delivered-not-unboxed]', err);
    return NextResponse.json({ success: false, error: 'Failed to load delivered-not-unboxed' }, { status: 500 });
  }
}, { permission: 'receiving.view' });
