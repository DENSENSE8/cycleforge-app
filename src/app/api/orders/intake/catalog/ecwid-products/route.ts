/**
 * GET /api/orders/intake/catalog/ecwid-products?shelf=sales|repair
 *
 * The new-sales-order product shelf — the counter's catalog core behind a
 * staff session instead of a kiosk device. `shelf=sales` (default) is the
 * retail segment (`/api/kiosk/sales/ecwid-products`), `shelf=repair` the
 * repair-service segment (`/api/kiosk/repair/ecwid-products`), each with its
 * own favorites list. Same wire shape either way.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { searchKioskCatalog } from '@/lib/kiosk/catalog-search';
import { readKioskCatalogQuery, toKioskCatalogResponse } from '@/lib/kiosk/catalog-request';
import { parseCatalogShelf, shelfFavoritesWorkspace, shelfSegment } from '@/lib/orders/intake/catalog-shelf';

export const runtime = 'nodejs';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const shelf = parseCatalogShelf(req.nextUrl.searchParams.get('shelf'));
  const parsed = readKioskCatalogQuery(req.nextUrl.searchParams, { favoritesWorkspace: shelfFavoritesWorkspace(shelf) });
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }
  const page = await searchKioskCatalog(ctx.organizationId as OrgId, { ...parsed.options, segment: shelfSegment(shelf) });
  // Availability is volatile — a stale bin count sends a picker to an empty shelf.
  return NextResponse.json(toKioskCatalogResponse(page), { headers: { 'Cache-Control': 'private, no-store' } });
}, { permission: 'orders.create' });
