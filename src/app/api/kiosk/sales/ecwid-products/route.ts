/**
 * GET /api/kiosk/sales/ecwid-products
 *
 * Device-authed retail catalog for the Buy/Sell left rail. Same response shape
 * as `/api/kiosk/repair/ecwid-products` so `ProductSelector` can swap
 * `apiBasePath` without a second picker. Filters OUT `-RS` repair SKUs.
 *
 * Query: `?mode=all` or `?categoryId=…`, plus `limit` / `offset`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { loadRetailProductsForOrg } from '@/lib/kiosk/sales-catalog';

export const runtime = 'nodejs';

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  try {
    const limitRaw = Number(req.nextUrl.searchParams.get('limit') || 10);
    const offsetRaw = Number(req.nextUrl.searchParams.get('offset') || 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 10;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

    const mode = String(req.nextUrl.searchParams.get('mode') || '').trim().toLowerCase();
    const categoryId = req.nextUrl.searchParams.get('categoryId');

    if (mode !== 'all' && !categoryId) {
      return NextResponse.json({ success: false, error: 'categoryId is required' }, { status: 400 });
    }

    const retail = await loadRetailProductsForOrg(ctx.organizationId as OrgId);
    const scoped =
      categoryId && mode !== 'all'
        ? retail.filter((product) => product.categoryIds.includes(categoryId))
        : retail;

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
    console.error('GET /api/kiosk/sales/ecwid-products error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
