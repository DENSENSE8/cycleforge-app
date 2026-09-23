/**
 * GET /api/kiosk/repair/ecwid-products
 *
 * Device-authed repair-service catalog for the kiosk repair rail. Same query
 * grammar and response shape as its sales twin (`readKioskCatalogQuery` /
 * `toKioskCatalogResponse`), so `ProductSelector` swaps `apiBasePath` without a
 * second picker.
 *
 * ## What changed
 * This route used to call `fetchRepairRootProductsCached`, which walks the live
 * Ecwid storefront (~25 sequential pages / ~16s cold) behind a two-tier cache,
 * then filtered and sliced in JS. A customer-facing counter must never sit on
 * that path — a cache miss during a walk-in is a 16-second stare. It now reads
 * the local projection through `searchKioskCatalog`, same as sales.
 *
 * ## Why the `-RS` suffix is the whole filter
 * The kiosk only ever offers real, bookable repair services. The old route
 * fetched the repair-root CATEGORY subtree and then narrowed to `-RS` SKUs, so
 * the category walk never changed the result — `isRepairServiceSku` was already
 * the binding constraint. `segment: 'service'` applies exactly that predicate
 * in SQL, which is why no category-chain walk has to be reproduced here.
 * Staff keep the fuller repair-root list on `/api/repair/ecwid-products`; they
 * need the adjacent shipping-fee and warranty line items, and the kiosk must
 * not offer them.
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
      favoritesWorkspace: 'repair',
    });
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const page = await searchKioskCatalog(ctx.organizationId as OrgId, {
      ...parsed.options,
      segment: 'service',
    });

    return NextResponse.json(toKioskCatalogResponse(page), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error: unknown) {
    console.error('GET /api/kiosk/repair/ecwid-products error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
