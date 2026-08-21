/**
 * GET /api/receiving/lines/[id]/suggested-location
 *
 * The directed putaway target for one line — "put this product HERE", with the
 * BASIS the leaf shows underneath it. Read-only, so no audit row; the writer is
 * `POST /api/receiving/lines/[id]/stage`.
 *
 * SoT: {@link fetchSuggestedPutawayLocation}. Returns `{ suggestion: null }`
 * when there is nothing honest to point at — never a guessed bin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { fetchSuggestedPutawayLocation } from '@/lib/receiving/suggested-putaway-location-server';

export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const lineId = Number(segments[segments.indexOf('lines') + 1]);
    if (!Number.isFinite(lineId) || lineId <= 0) {
      return NextResponse.json(
        { success: false, error: 'invalid line id' },
        { status: 400 },
      );
    }

    try {
      const suggestion = await fetchSuggestedPutawayLocation(ctx.organizationId, {
        lineId,
      });
      return NextResponse.json({ success: true, suggestion });
    } catch (error: unknown) {
      console.error('GET /api/receiving/lines/[id]/suggested-location failed:', error);
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to resolve a putaway suggestion',
        },
        { status: 500 },
      );
    }
  },
  { permission: 'receiving.view' },
);
