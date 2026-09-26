/** GET /api/receiving/lines/[id]/suggested-location */

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

    const suggestion = await fetchSuggestedPutawayLocation(ctx.organizationId, {
      lineId,
    });
    return NextResponse.json({ success: true, suggestion });
  },
  { permission: 'receiving.view' },
);
