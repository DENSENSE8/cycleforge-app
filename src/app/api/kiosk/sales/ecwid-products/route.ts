/**
 * GET /api/kiosk/sales/ecwid-products
 *
 * Device-authed retail catalog for the kiosk Buy/Sell rail. Same response shape
 * as `/api/kiosk/repair/ecwid-products` so `ProductSelector` can swap
 * `apiBasePath` without a second picker. Filters OUT `-RS` repair SKUs.
 *
 * Reads the local catalog projection through `searchKioskCatalog` — filtered,
 * ranked, paged, and availability-joined in ONE SQL round trip. It previously
 * SELECTed every active listing for the org and sliced in JS, which made the
 * counter's find-bar cost grow with the catalog and left on-hand and bin
 * location unanswerable.
 *
 * Query: `?q=` (whole-catalog search) · `?barcode=` (wedge identity) ·
 *        `?mode=all` | `?mode=favorites` | `?categoryId=…` (browse), plus
 *        `limit` / `offset`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { searchKioskCatalog } from '@/lib/kiosk/catalog-search';
import { readKioskCatalogQuery, toKioskCatalogResponse } from '@/lib/kiosk/catalog-request';

export const runtime = 'nodejs';

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = readKioskCatalogQuery(req.nextUrl.searchParams, {
      favoritesWorkspace: 'sales',
    });
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const page = await searchKioskCatalog(ctx.organizationId as OrgId, {
      ...parsed.options,
      segment: 'retail',
    });

    return NextResponse.json(toKioskCatalogResponse(page), {
      // Availability is the volatile half of this payload — a stale bin count
      // sends a staffer to an empty shelf. No shared/proxy caching.
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error: unknown) {
    console.error('GET /api/kiosk/sales/ecwid-products error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
