/** GET/PUT /api/repair/favorites */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  applyFavoriteToggle,
  FavoriteTogglePayloadSchema,
  readFavoritesRail,
} from '@/lib/favorites/favorites-rail';

export const runtime = 'nodejs';

const WORKSPACE = 'repair' as const;

export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    try {
      return NextResponse.json(await readFavoritesRail(WORKSPACE, ctx.organizationId));
    } catch (error: unknown) {
      console.error('GET /api/repair/favorites error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ error: 'Failed to fetch favorites', details: message }, { status: 500 });
    }
  },
  { permission: 'repair.intake' },
);

export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    const parsed = FavoriteTogglePayloadSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    try {
      return NextResponse.json(
        await applyFavoriteToggle(WORKSPACE, ctx.organizationId, parsed.data, ctx.staffId ?? null),
      );
    } catch (error: unknown) {
      console.error('PUT /api/repair/favorites error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ error: 'Failed to update favorite', details: message }, { status: 500 });
    }
  },
  { permission: 'repair.intake' },
);
