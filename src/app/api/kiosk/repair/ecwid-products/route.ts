/**
 * GET /api/kiosk/repair/ecwid-products
 *
 * Device-authed twin of `/api/repair/ecwid-products` — same repair-root
 * catalog, gated by `withKioskAuth` instead of a staff session/permission,
 * with two kiosk-only narrowings:
 *
 *   1. `-RS`-suffixed SKUs only (`isRepairServiceSku`). The repair root also
 *      holds shipping fees, warranty add-ons, and spare parts that are not
 *      themselves a bookable service; the kiosk must only ever offer real
 *      repair services. Staff keep the fuller list on purpose — they need
 *      those adjacent line items.
 *   2. Category pages are filtered from the already-fetched repair-root list
 *      rather than paged at Ecwid, so the `-RS` filter is applied BEFORE
 *      slicing. Paging at Ecwid then filtering would yield short/ragged pages
 *      and a wrong `hasMore`.
 *
 * Query: `?mode=all` or `?categoryId=…`, plus `limit` / `offset`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import {
  resolveEcwidStoreCreds,
  fetchRepairRootProductsCached,
  isRepairServiceSku,
} from '@/lib/repair/ecwid-repair-catalog';

export const runtime = 'nodejs';

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  try {
    const { storeId, token } = resolveEcwidStoreCreds();

    const limitRaw = Number(req.nextUrl.searchParams.get('limit') || 10);
    const offsetRaw = Number(req.nextUrl.searchParams.get('offset') || 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 10;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

    const mode = String(req.nextUrl.searchParams.get('mode') || '').trim().toLowerCase();
    const categoryId = req.nextUrl.searchParams.get('categoryId');

    if (mode !== 'all' && !categoryId) {
      return NextResponse.json({ success: false, error: 'categoryId is required' }, { status: 400 });
    }

    const repairServices = (
      await fetchRepairRootProductsCached(storeId, token, ctx.organizationId)
    ).filter((product) => isRepairServiceSku(product.sku));
    const scoped = categoryId && mode !== 'all'
      ? repairServices.filter((product) => product.categoryIds.includes(categoryId))
      : repairServices;

    const page = scoped.slice(offset, offset + limit);

    return NextResponse.json(
      {
        success: true,
        products: page,
        total: scoped.length,
        limit,
        offset,
        hasMore: offset + page.length < scoped.length,
      },
      { headers: { 'Cache-Control': 'private, max-age=120' } },
    );
  } catch (error: unknown) {
    console.error('GET /api/kiosk/repair/ecwid-products error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
