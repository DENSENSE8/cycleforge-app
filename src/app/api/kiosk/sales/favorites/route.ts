/**
 * GET/PUT /api/kiosk/sales/favorites
 *
 * Device-authed retail favorites for the kiosk Buy/Sell rail — the twin of
 * `/api/kiosk/repair/favorites`, same wire shape, `sales` workspace. The rail
 * decides the workspace; the client only ever asks `${apiBasePath}/favorites`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import {
  applyFavoriteToggle,
  FavoriteTogglePayloadSchema,
  readFavoritesRail,
} from '@/lib/favorites/favorites-rail';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const WORKSPACE = 'sales' as const;

export const GET = withKioskAuth(async (_req: NextRequest, ctx) => {
  try {
    return NextResponse.json(await readFavoritesRail(WORKSPACE, ctx.organizationId as OrgId));
  } catch (error: unknown) {
    console.error('GET /api/kiosk/sales/favorites error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to fetch favorites', details: message }, { status: 500 });
  }
});

export const PUT = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = FavoriteTogglePayloadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await applyFavoriteToggle(WORKSPACE, ctx.organizationId as OrgId, parsed.data),
    );
  } catch (error: unknown) {
    console.error('PUT /api/kiosk/sales/favorites error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to update favorite', details: message }, { status: 500 });
  }
});
