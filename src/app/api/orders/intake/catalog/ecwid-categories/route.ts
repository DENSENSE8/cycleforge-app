/**
 * GET /api/orders/intake/catalog/ecwid-categories?shelf=sales|repair&parentId=
 *
 * One level of the shelf's category tree for the new-sales-order trail —
 * the counter's `/api/kiosk/sales/ecwid-categories` (retail) or
 * `/api/kiosk/repair/ecwid-categories` (repair services), staff-authed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { loadRetailCategoryLevelForOrg } from '@/lib/kiosk/sales-catalog';
import { parseCatalogShelf } from '@/lib/orders/intake/catalog-shelf';
import { resolveEcwidStoreCreds, resolveRepairCategoryLevelCached } from '@/lib/repair/ecwid-repair-catalog';

export const runtime = 'nodejs';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const parentId = req.nextUrl.searchParams.get('parentId');
  const shelf = parseCatalogShelf(req.nextUrl.searchParams.get('shelf'));
  let level;
  if (shelf === 'repair') {
    const { storeId, token } = resolveEcwidStoreCreds();
    level = await resolveRepairCategoryLevelCached(storeId, token, parentId, ctx.organizationId);
  } else {
    level = await loadRetailCategoryLevelForOrg(ctx.organizationId as OrgId, parentId);
  }
  return NextResponse.json(
    { success: true, ...level },
    { headers: { 'Cache-Control': `private, max-age=${level.message ? 60 : 120}` } },
  );
}, { permission: 'orders.create' });
