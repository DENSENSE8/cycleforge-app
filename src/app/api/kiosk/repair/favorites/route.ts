/**
 * GET/PUT /api/kiosk/repair/favorites
 *
 * Device-authed repair favorites for the front-desk kiosk — the same org-scoped
 * rows staff curate, gated by `withKioskAuth` instead of a staff session.
 *
 * ## The list is a catalog SCOPE now, not a rail
 * The picker lands on `?mode=favorites` (see `/api/kiosk/repair/ecwid-products`)
 * and paints the favorites as ordinary product tiles. This route answers two
 * questions about that list: which SKUs are on it (GET, for the tile pip), and
 * put this SKU on / take it off (PUT).
 *
 * ## Why a device may write
 * Same ruling as `/api/kiosk/repair/issues` POST (operator 2026-09-14): the
 * front desk is staffed, and the person holding the customer's unit is the one
 * who knows the repair is a common one. The authority is narrow — membership of
 * THIS rail's list for a SKU named by the body. Labels, prices, notes and issue
 * templates stay on the staff routes.
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

const WORKSPACE = 'repair' as const;

export const GET = withKioskAuth(async (_req: NextRequest, ctx) => {
  try {
    return NextResponse.json(await readFavoritesRail(WORKSPACE, ctx.organizationId as OrgId));
  } catch (error: unknown) {
    console.error('GET /api/kiosk/repair/favorites error:', error);
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
    console.error('PUT /api/kiosk/repair/favorites error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to update favorite', details: message }, { status: 500 });
  }
});
