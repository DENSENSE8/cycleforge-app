/**
 * GET/PUT /api/orders/intake/catalog/favorites?shelf=sales|repair
 *
 * The counter's curated lists — `sales` (default) or `repair` favorites
 * workspace — so the shelf lands on them, as the counter does. Staff-authed
 * twin of `/api/kiosk/{sales,repair}/favorites`; a star set here shows on the
 * counter too.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  applyFavoriteToggle,
  FavoriteTogglePayloadSchema,
  readFavoritesRail,
} from '@/lib/favorites/favorites-rail';
import { parseCatalogShelf, shelfFavoritesWorkspace } from '@/lib/orders/intake/catalog-shelf';

export const runtime = 'nodejs';

const workspaceOf = (req: NextRequest) => shelfFavoritesWorkspace(parseCatalogShelf(req.nextUrl.searchParams.get('shelf')));

export const GET = withAuth(
  async (req: NextRequest, ctx) => NextResponse.json(await readFavoritesRail(workspaceOf(req), ctx.organizationId)),
  { permission: 'orders.create' },
);

export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    const parsed = FavoriteTogglePayloadSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    return NextResponse.json(await applyFavoriteToggle(workspaceOf(req), ctx.organizationId, parsed.data, ctx.staffId ?? null));
  },
  { permission: 'orders.create' },
);
