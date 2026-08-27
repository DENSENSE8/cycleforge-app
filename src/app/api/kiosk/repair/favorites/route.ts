/**
 * GET /api/kiosk/repair/favorites
 *
 * Device-authed, read-only repair favorites for the front-desk kiosk. Same
 * org-scoped rows staff curate under `/api/favorites?workspace=repair`, but
 * gated by `withKioskAuth` (no staff session, no CRUD). Use-template only —
 * create/edit/delete stay on the staff `/repair` sidebar.
 */

import { NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { listFavoriteSkus } from '@/lib/favorites/sku-favorites';

export const runtime = 'nodejs';

export const GET = withKioskAuth(async (_req, ctx) => {
  try {
    const favorites = await listFavoriteSkus('repair', false, ctx.organizationId);
    return NextResponse.json({
      favorites,
      count: favorites.length,
      workspaceKey: 'repair',
    });
  } catch (error: unknown) {
    console.error('GET /api/kiosk/repair/favorites error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch favorites', details: message },
      { status: 500 },
    );
  }
});
